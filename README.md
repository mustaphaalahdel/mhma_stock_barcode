[العربية](README.ar.md)

# MHMA Stock Barcode (`mhma_stock_barcode`)

A dedicated **Inventory Adjustment (Stock Count)** barcode app for **Odoo 17**, focused on showing and processing **only the products/quant lines assigned to the current user**.

This module provides a full-screen barcode interface (mobile-friendly) similar to Odoo’s barcode adjustment experience, but optimized for **user-assigned physical inventory counting** with a single, streamlined screen.

> Note: This is a custom module. Documentation style follows an OCA-like structure.

## Table of contents
- [Overview](#overview)
- [How it works](#how-it-works)
- [Key features](#key-features)
- [Security & access](#security--access)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Reports](#reports)
- [Technical notes](#technical-notes)
- [Known limitations](#known-limitations)
- [Bug Tracker](#bug-tracker)
- [Credits](#credits)
- [Maintainers](#maintainers)
- [License](#license)

## Overview
`mhma_stock_barcode` is a standalone application that opens directly into **Inventory Adjustments** (quants counting) and displays **only** the lines assigned to the logged-in user.

It is designed for organizations that:
- Assign counting tasks to specific employees.
- Want the employee to open the app and immediately see “what to count today”.
- Need quick count editing with barcode scanning + search + print + save in one place.

## How it works
When opening the app, it fetches and displays `stock.quant` lines filtered by:
- `user_id` = current user
- locations usage in **internal/transit**
- `inventory_date` <= today

This means each user sees only their assigned counting tasks that are due today (or earlier).

## Key features
- **Dedicated Adjustment App**
  - App menu opens directly into the inventory adjustment barcode screen (no extra menus).

- **Assigned-to-user focus**
  - Only show quants assigned to the current user, making the UI clean and task-oriented.

- **Top search bar (ilike)**
  - Sticky search bar at the top of the adjustment screen.
  - Searches `product.product.display_name` using `ilike` and filters displayed lines locally.
  - Useful for searching by product name, internal reference, variant values, and anything included in `display_name`.

- **All primary actions in one bottom bar**
  - **Print**
  - **Barcode** (manual scanner)
  - **Save** (shows number of lines to apply)

- **Quick count actions**
  - One-tap “set/unset” on a line.
  - +/- buttons for fast increment/decrement (when applicable).
  - Edit (pencil) to open the line form and enter counted quantity via digipad.

- **Barcode & GS1 behavior**
  - Uses company barcode nomenclature and supports GS1 preprocessing (when enabled in the company).

- **Sound notifications control**
  - Respects configuration to enable/disable barcode sounds.

## Security & access
### Groups
- **Adjustment Only** group:
  - XML ID: `mhma_stock_barcode.adjustment_only_group`
  - Intended for internal users who should count stock without full inventory permissions.

### Assignment wizard domain enhancement
The module extends the **Request a Count** wizard (`stock.request.count`) user selection domain to include:
- Inventory Users (`stock.group_stock_user`)
- Adjustment Only users (`mhma_stock_barcode.adjustment_only_group`)

## Installation
1. Copy the `mhma_stock_barcode` directory into your Odoo addons path.
2. Restart Odoo.
3. Enable Developer Mode.
4. Apps → Update Apps List.
5. Search for **MHMA Stock Barcode** and install.

## Configuration
1. **Add users to the proper group(s):**
   - Either **Inventory / User** (recommended), or
   - **Adjustment Only** (for limited counting role)

2. **Assign counting tasks from Inventory app**
   - Use Odoo’s “Request a Count” / assignment workflow (wizard `stock.request.count`) to assign products/quants to a user.
   - Ensure the **Inventory Date** is **today or earlier**, otherwise tasks won’t show in the barcode app.

## Usage
1. Open **MHMA Stock Barcode** app.
2. The app displays only your assigned adjustment lines.
3. Use:
   - **Search** (top bar) to filter products
   - **Barcode** to scan
   - **Edit** (pencil) to open a line and input counted qty
   - **Set/Unset** and **+/-** for fast adjustments
4. Click **Save** to apply counted quantities for the current page.
5. Print the adjustment report if required.

## Reports
- **Inventory Adjustment (Barcode)** PDF report is available from the Print button.
- The report includes:
  - Employee name (current user)
  - Date/time
  - Lines grouped by location (when multi-location is enabled)
  - Quantity columns and optional tracking/package columns
  - Signature placeholders (custom layout)

## Technical notes
- App menu action points to the inventory client action:
  - `mhma_stock_barcode.stock_barcode_inventory_client_action`
- On open, inventory data is loaded from `stock.quant._get_stock_barcode_data()` which filters by:
  - `user_id = current user`
  - `location usage in internal/transit`
  - `inventory_date <= today`
- Search implementation:
  - `product.product` searchRead on `display_name ilike <term>` (limit 200)
  - UI filtering is local (does not change the backend domain)

## Known limitations
- Search uses `product.product.display_name` and is limited to 200 matching products per query.
- Tasks appear only if `inventory_date` is set and is <= today.
- Access rights depend on your inventory security setup; if using “Adjustment Only”, ensure required read access exists for related models (products, locations, lots, uom) in your environment.

## Bug Tracker
Report issues and feature requests via GitHub Issues in this repository.

## Credits
### Author
- Mustapha Alahdel

## Maintainers
This module is maintained by **Mustapha Alahdel**.

## License
License is defined in `__manifest__.py` (currently: `OEEL-1`).
Ensure compliance with Odoo licensing before distributing publicly.
