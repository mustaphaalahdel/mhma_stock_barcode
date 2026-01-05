from odoo import models, api

class ReportInventoryAdjustment(models.AbstractModel):
    _name = 'report.mhma_stock_barcode.report_inventory_adjustment'
    _description = 'Inventory Adjustment Report (By User)'

    @api.model
    def _get_report_values(self, docids, data=None):

        current_user = self.env.user

        quants = self.env['stock.quant'].search(
            [('user_id', '=', current_user.id)],
            order='location_id, product_id'
        )

        return {
            'docs': quants,
            'env': self.env,
        }
