# -*- coding: utf-8 -*-

from odoo import fields, models


class StockRequestCount(models.TransientModel):
    _inherit = 'stock.request.count'

    user_id = fields.Many2one(
        'res.users',
        string="User",
        domain=lambda self: [
            ('groups_id', 'in', [
                self.env.ref('stock.group_stock_user').id,
                self.env.ref('mhma_stock_barcode.adjustment_only_group').id,
            ])
        ]
    )
