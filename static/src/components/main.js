/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { Chatter } from "@mail/core/web/chatter";
import { COMMANDS } from "@barcodes/barcode_handlers";
import BarcodePickingModel from "@mhma_stock_barcode/models/barcode_picking_model";
import BarcodeQuantModel from "@mhma_stock_barcode/models/barcode_quant_model";
import GroupedLineComponent from "@mhma_stock_barcode/components/grouped_line";
import LineComponent from "@mhma_stock_barcode/components/line";
import PackageLineComponent from "@mhma_stock_barcode/components/package_line";
import { registry } from "@web/core/registry";
import { useService, useBus } from "@web/core/utils/hooks";
import * as BarcodeScanner from "@web/webclient/barcode/barcode_scanner";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { View } from "@web/views/view";
import { ManualBarcodeScanner } from "./manual_barcode";
import { url } from "@web/core/utils/urls";
import { utils as uiUtils } from "@web/core/ui/ui_service";
import { Component, EventBus, onPatched, onWillStart, useState, useSubEnv } from "@odoo/owl";

// Lets `barcodeGenericHandlers` know these commands exist so it doesn't warn when scanned.
COMMANDS["O-CMD.MAIN-MENU"] = () => { };
COMMANDS["O-CMD.cancel"] = () => { };

const bus = new EventBus();

class StockBarcodeUnlinkButton extends Component {
    static template = "stock_barcode.UnlinkButton";
    setup() {
        this.orm = useService("orm");
    }
    async onClick() {
        const { resModel, resId, context } = this.props.record;
        await this.orm.unlink(resModel, [resId], { context });
        bus.trigger("refresh");
    }
}

registry.category("view_widgets").add("stock_barcode_unlink_button", {
    component: StockBarcodeUnlinkButton,
});

/**
 * Main Component
 * - Gather line information
 * - Manage scan & save process
 *
 * ✅ Added:
 * - Search input + Search button + Clear button (based on main.xml)
 * - Search is done on product.product.display_name
 * - Then filters displayed lines (locally) without modifying the JS model
 */
class MainComponent extends Component {
    //--------------------------------------------------------------------------
    // Lifecycle
    //--------------------------------------------------------------------------

    setup() {
        this.rpc = useService("rpc");
        this.orm = useService("orm");
        this.notification = useService("notification");
        this.dialog = useService("dialog");
        this.action = useService("action");

        this.resModel = this.props.action.res_model;
        this.resId = this.props.action.context.active_id || false;

        const model = this._getModel();
        useSubEnv({ model });

        this._scrollBehavior = "smooth";
        this.isMobile = uiUtils.isSmall();

        // ✅ Search state is reactive and triggers UI updates automatically
        this.state = useState({
            view: "barcodeLines", // Could also be: 'actionsView', 'productPage', 'infoFormView', ...
            displayNote: false,

            // =========================================================
            // ✅ Search
            // productSearchTerm: text typed by the user
            // productSearchIds: result product IDs (from product.product)
            //   - null  => no filter (show all)
            //   - []    => no results (show nothing)
            //   - [..]  => show lines whose product_id is in this list
            // totalCount / filteredCount: optional counters for UI
            // =========================================================
            productSearchTerm: "",
            productSearchIds: null,
            totalCount: 0,
            filteredCount: 0,
        });

        this.barcodeService = useService("barcode");
        useBus(this.barcodeService.bus, "barcode_scanned", (ev) => this.onBarcodeScanned(ev.detail.barcode));

        useBus(this.env.model, "flash", this.flashScreen.bind(this));
        useBus(this.env.model, "playSound", this.playSound.bind(this));
        useBus(bus, "refresh", (ev) => this._onRefreshState(ev.detail));

        onWillStart(async () => {
            const barcodeData = await this.rpc("/stock_barcode/get_barcode_data", {
                model: this.resModel,
                res_id: this.resId,
            });
            barcodeData.actionId = this.props.actionId;

            this.config = { play_sound: true, ...barcodeData.config };
            if (this.config.play_sound) {
                const fileExtension = new Audio().canPlayType("audio/ogg") ? "ogg" : "mp3";
                this.sounds = {
                    error: new Audio(url(`/stock_barcode/static/src/audio/error.${fileExtension}`)),
                    notify: new Audio(url(`/mail/static/src/audio/ting.${fileExtension}`)),
                };
                this.sounds.error.load();
                this.sounds.notify.load();
            }

            this.groups = barcodeData.groups;
            this.env.model.setData(barcodeData);

            this.state.displayNote = Boolean(this.env.model.record.note);

            // ✅ Update counters after initial data load
            this._updateSearchCounters();

            this.env.model.addEventListener("process-action", this._onDoAction.bind(this));
            this.env.model.addEventListener("refresh", (ev) => this._onRefreshState(ev.detail));

            // ✅ When model updates, refresh counters and rerender
            this.env.model.addEventListener("update", () => {
                this._updateSearchCounters();
                this.render(true);
            });

            this.env.model.addEventListener("history-back", () => this.env.config.historyBack());
        });

        onPatched(() => {
            this._scrollToSelectedLine();
        });
    }

    playSound(ev) {
        const type = ev.detail || "notify";
        if (this.config.play_sound) {
            this.sounds[type].currentTime = 0;
            this.sounds[type].play();
        }
    }

    //--------------------------------------------------------------------------
    // ✅ Search handlers (used by main.xml)
    //--------------------------------------------------------------------------

    /**
     * Run search when user presses Enter in the input.
     */
    onSearchKeydown(ev) {
        if (ev.key === "Enter") {
            this.onSearchClick();
        }
    }

    /**
     * Search button:
     * - Search in product.product.display_name using ilike
     * - Store product IDs in state.productSearchIds
     * - UI filters lines locally
     */
    async onSearchClick() {
        const term = (this.state.productSearchTerm || "").trim();

        // Empty term => clear filter and show all
        if (!term) {
            this.state.productSearchIds = null;
            this._updateSearchCounters();
            return;
        }

        try {
            const products = await this.orm.searchRead(
                "product.product",
                [["display_name", "ilike", term]],
                ["id"],
                { limit: 200 }
            );

            const ids = products.map((p) => p.id);

            // No results
            if (!ids.length) {
                this.state.productSearchIds = []; // filter that shows nothing
                this._updateSearchCounters();
                this.notification.add(_t("No matching products were found."), { type: "warning" });
                return;
            }

            // Save IDs as the active filter
            this.state.productSearchIds = ids;
            this._updateSearchCounters();
        } catch (e) {
            this.notification.add(_t("An error occurred while searching."), { type: "danger" });
        }
    }

    /**
     * Clear button:
     * - Clear input
     * - Remove filter
     */
    onSearchClear() {
        this.state.productSearchTerm = "";
        this.state.productSearchIds = null;
        this._updateSearchCounters();
    }

    /**
     * Helper: safely extract product_id from a line.
     * product_id can be:
     * - number
     * - [id, name]
     * - {id: X, display_name: "..."}
     */
    _getProductIdFromLine(line) {
        const p = line && line.product_id;
        if (!p) return null;

        if (typeof p === "number") return p;
        if (Array.isArray(p)) return p[0];
        if (typeof p === "object" && p.id) return p.id;

        return null;
    }

    /**
     * Apply local filtering of groupedLines based on state.productSearchIds.
     * - Keeps grouping structure (line.lines)
     * - Does not mutate original data (returns shallow copies for groups)
     */
    _applyProductFilter(groupedLines) {
        const ids = this.state.productSearchIds;

        // No filter => show all
        if (ids === null) {
            return groupedLines;
        }

        // Filter exists but empty => show nothing
        if (Array.isArray(ids) && ids.length === 0) {
            return [];
        }

        const allowed = new Set(ids);

        const result = [];
        for (const line of groupedLines || []) {
            // Grouped line
            if (line.lines && Array.isArray(line.lines)) {
                const keptSublines = line.lines.filter((sub) => {
                    const pid = this._getProductIdFromLine(sub);
                    return pid && allowed.has(pid);
                });
                if (keptSublines.length) {
                    result.push({ ...line, lines: keptSublines });
                }
            } else {
                // Normal line
                const pid = this._getProductIdFromLine(line);
                if (pid && allowed.has(pid)) {
                    result.push(line);
                }
            }
        }
        return result;
    }

    /**
     * Count leaf lines in groupedLines:
     * - group => number of sublines
     * - normal line => 1
     */
    _countLeafLines(groupedLines) {
        let count = 0;
        for (const line of groupedLines || []) {
            if (line.lines && Array.isArray(line.lines)) {
                count += line.lines.length;
            } else {
                count += 1;
            }
        }
        return count;
    }

    /**
     * Update total/filtered counters (optional for UI).
     */
    _updateSearchCounters() {
        try {
            const allLines = this.env.model.groupedLines || [];
            const filteredLines = this._applyProductFilter(allLines);

            this.state.totalCount = this._countLeafLines(allLines);
            this.state.filteredCount = this._countLeafLines(filteredLines);
        } catch (e) {
            // Ignore counter errors
        }
    }

    //--------------------------------------------------------------------------
    // Public getters
    //--------------------------------------------------------------------------

    get highlightValidateButton() {
        return this.env.model.highlightValidateButton;
    }

    get isTransfer() {
        return this.currentSourceLocation && this.currentDestinationLocation;
    }

    get lineFormViewProps() {
        return {
            resId: this._editedLineParams && this._editedLineParams.currentId,
            resModel: this.env.model.lineModel,
            context: this.env.model._getNewLineDefaultContext(),
            viewId: this.env.model.lineFormViewId,
            display: { controlPanel: false },
            mode: "edit",
            type: "form",
            onSave: (record) => this.saveFormView(record),
            onDiscard: () => this.toggleBarcodeLines(),
        };
    }

    /**
     * Lines to render:
     * - Take base groupedLines from env.model
     * - Apply local filtering (if active)
     */
    get lines() {
        const base = this.env.model.groupedLines;
        return this._applyProductFilter(base);
    }

    get mobileScanner() {
        return BarcodeScanner.isBarcodeScannerSupported();
    }

    get packageLines() {
        // Note: Not filtered (requirement was to filter product lines only)
        return this.env.model.packageLines;
    }

    get addLineBtnName() {
        return _t("Add Product");
    }

    get displayActionButtons() {
        return this.state.view === "barcodeLines" && this.env.model.canBeProcessed;
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    _getModel() {
        const services = { rpc: this.rpc, orm: this.orm, notification: this.notification, action: this.action };
        if (this.resModel === "stock.picking") {
            services.dialog = this.dialog;
            return new BarcodePickingModel(this.resModel, this.resId, services);
        } else if (this.resModel === "stock.quant") {
            return new BarcodeQuantModel(this.resModel, this.resId, services);
        } else {
            throw new Error("No JS model defined");
        }
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    async cancel() {
        await this.env.model.save();
        const action = await this.orm.call(this.resModel, "action_cancel_from_barcode", [[this.resId]]);
        const onClose = (res) => {
            if (res && res.cancelled) {
                this.env.model._cancelNotification();
                this.env.config.historyBack();
            }
        };
        this.action.doAction(action, { onClose: onClose.bind(this) });
    }

    async onBarcodeScanned(barcode) {
        if (!barcode) {
            const message = _t("Please, scan again!");
            this.env.services.notification.add(message, { type: "warning" });
            return;
        }
        try {
            await this.env.model.processBarcode(barcode);
            if ("vibrate" in window.navigator) {
                window.navigator.vibrate(100);
            }
        } catch (e) {
            const msg =
                (e && e.message) ||
                (e && e.data && e.data.message) ||
                _t("No picking or location or product corresponding to barcode %s", barcode);
            this.env.services.notification.add(msg, { type: "danger" });
        }
    }

    async openMobileScanner() {
        const barcode = await BarcodeScanner.scanBarcode(this.env);
        this.onBarcodeScanned(barcode);
    }

    openManualScanner() {
        this.dialog.add(ManualBarcodeScanner, {
            openMobileScanner: async () => {
                await this.openMobileScanner();
            },
            onApply: async (barcode) => {
                barcode = this.env.model.cleanBarcode(barcode);
                await this.onBarcodeScanned(barcode);
                return true;
            },
        });
    }

    async exit(ev) {
        if (this.state.view === "barcodeLines") {
            await this.env.model.beforeQuit();
            this.env.config.historyBack();
        } else {
            this.toggleBarcodeLines();
        }
    }

    flashScreen() {
        const clientAction = document.querySelector(".o_barcode_client_action");
        clientAction.style.animation = "none";
        clientAction.offsetHeight; // Trigger reflow
        clientAction.style.animation = null;
        clientAction.classList.add("o_white_flash");
    }

    putInPack(ev) {
        ev.stopPropagation();
        this.env.model._putInPack();
    }

    returnProducts(ev) {
        ev.stopPropagation();
        this.env.model._returnProducts();
    }

    saveFormView(lineRecord) {
        const lineId = (lineRecord && lineRecord.resId) || (this._editedLineParams && this._editedLineParams.currentId);
        const recordId = lineRecord.resModel === this.resModel ? lineId : undefined;
        this._onRefreshState({ recordId, lineId });
    }

    toggleBarcodeActions() {
        this.state.view = "actionsView";
    }

    async toggleBarcodeLines(lineId) {
        await this.env.model.displayBarcodeLines(lineId);
        this._editedLineParams = undefined;
        this.state.view = "barcodeLines";

        // ✅ Update counters when returning to lines view
        this._updateSearchCounters();
    }

    async toggleInformation() {
        await this.env.model.save();
        this.state.view = "infoFormView";
    }

    async validate(ev) {
        ev.stopPropagation();
        await this.env.model.validate();
    }

    _onBarcodeScanned(barcode) {
        if (this.state.view === "barcodeLines") {
            this.env.model.processBarcode(barcode);
        }
    }

    _getHeaderHeight() {
        const header = document.querySelector(".o_barcode_header");
        const navbar = document.querySelector(".o_main_navbar");
        return navbar ? navbar.offsetHeight + header.offsetHeight : header.offsetHeight;
    }




    _scrollToSelectedLine() {
        // نعمل اسكرول للمنتصف فقط عندما نكون في شاشة الخطوط
        if (this.state.view !== "barcodeLines" || !this.env.model.canBeProcessed) {
            this._scrollBehavior = "auto";
            return;
        }

        const page = document.querySelector(".o_barcode_lines");
        if (!page) return;

        // إيجاد السطر المحدد (highlight)
        let selectedLine = document.querySelector(".o_sublines .o_barcode_line.o_highlight");
        const isSubline = Boolean(selectedLine);

        if (!selectedLine) {
            selectedLine = document.querySelector(".o_barcode_line.o_highlight");
        }

        // fallback: إذا ما وجد highlight نحاول نجيب line حسب current location
        if (!selectedLine && this.env.model.findLineForCurrentLocation) {
            const matchingLine = this.env.model.findLineForCurrentLocation();
            if (matchingLine) {
                selectedLine = document.querySelector(`.o_barcode_line[data-virtual-id="${matchingLine.virtual_id}"]`);
            }
        }

        if (!selectedLine) return;

        // لو كان subline: نخلي الهدف parent line عشان العرض يكون منطقي
        let targetEl = selectedLine;
        if (isSubline) {
            const parentLine = selectedLine.closest(".o_barcode_lines > .o_barcode_line");
            if (parentLine) targetEl = parentLine;
        }

        const pageRect = page.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();

        // مركز العنصر + مركز منطقة عرض القائمة
        const targetCenter = targetRect.top + targetRect.height / 2;
        const pageCenter = pageRect.top + pageRect.height / 2;

        // الفرق الذي نحتاجه للتحريك
        const delta = targetCenter - pageCenter;

        // لو الفرق بسيط، لا تحرك (لتجنب الاهتزاز)
        if (Math.abs(delta) < 5) return;

        const newTop = page.scrollTop + delta;

        page.scroll({
            left: 0,
            top: newTop,
            behavior: this._scrollBehavior,
        });

        // بعد أول اسكرول "auto" نخليه smooth لباقي التحركات
        this._scrollBehavior = "smooth";
    }





    async _onDoAction(ev) {
        this.action.doAction(ev.detail, { onClose: this._onRefreshState.bind(this) });
    }

    onOpenPackage(packageId) {
        this._inspectedPackageId = packageId;
        this.state.view = "packagePage";
    }

    async onOpenProductPage(line) {
        await this.env.model.save();
        if (line) {
            const virtualId = line.virtual_id;
            if (!line.id && virtualId) {
                line = this.env.model.pageLines.find((l) => l.dummy_id === virtualId);
            }
            this._editedLineParams = this.env.model.getEditedLineParams(line);
        }
        this.state.view = "productPage";
    }

    async _onRefreshState(paramsRefresh) {
        const { recordId, lineId } = paramsRefresh || {};
        const { route, params } = this.env.model.getActionRefresh(recordId);
        const result = await this.rpc(route, params);
        await this.env.model.refreshCache(result.data.records);

        // ✅ Counters may change after server refresh
        this._updateSearchCounters();

        await this.toggleBarcodeLines(lineId);
        this.render();
    }

    _onWarning(ev) {
        const { title, message } = ev.detail;
        this.env.services.dialog.add(ConfirmationDialog, { title, body: message });
    }
}

MainComponent.props = ["action", "actionId?", "className?", "globalState?", "resId?"];
MainComponent.template = "stock_barcode.MainComponent";
MainComponent.components = {
    Chatter,
    View,
    GroupedLineComponent,
    LineComponent,
    PackageLineComponent,
};

registry.category("actions").add("stock_barcode_client_action", MainComponent);

export default MainComponent;
