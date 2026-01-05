# -*- coding: utf-8 -*-

{
    'name': "MHMA Barcode",
    'summary': "Use barcode scanners to process logistics operations",
    'description': """
This module enables the barcode scanning feature for the warehouse management system.
    """,
    'category': 'Inventory/Inventory',
    'sequence': 255,
    'version': '1.0',
    'depends': ['stock', 'web_tour', 'web_mobile'],
    'data': [
        'security/security.xml',
        'security/ir.model.access.csv',
        'data/data.xml',
        'data/portrait_custom_paperformat.xml',
        'report/external_layout_custom.xml',
        'report/report.xml',
        'report/report_inventory_adjustment.xml',
        'views/stock_inventory_views.xml',
        'views/stock_picking_views.xml',
        'views/stock_move_line_views.xml',
        'views/stock_barcode_views.xml',
        'views/res_config_settings_views.xml',
        'views/stock_scrap_views.xml',
        'views/stock_location_views.xml',
        'wizard/stock_barcode_cancel_operation.xml',
        'wizard/stock_backorder_confirmation_views.xml',
        
    ],
    'demo': [
        'data/demo.xml',
    ],
    'installable': True,
    'application': True,
    'assets': {
        'web.assets_backend': [
            'mhma_stock_barcode/static/src/**/*.js',
            'mhma_stock_barcode/static/src/**/*.scss',
            'mhma_stock_barcode/static/src/**/*.xml',

            # Don't include dark mode files in light mode
            ('remove', 'mhma_stock_barcode/static/src/**/*.dark.scss'),
        ],
        "web.assets_web_dark": [
            'mhma_stock_barcode/static/src/**/*.dark.scss',
        ],
        'web.qunit_suite_tests': [
            'mhma_stock_barcode/static/tests/units/**/*',
        ],
        'web.assets_tests': [
            'mhma_stock_barcode/static/tests/tours/**/*',
        ],
    }
}
