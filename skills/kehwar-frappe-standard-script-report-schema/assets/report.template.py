# Copyright (c) __YEAR__, __APP_PUBLISHER__ and contributors
# For license information, please see license.txt

# import frappe


def execute(filters=None):
    columns = [
        {
            "label": "Name",
            "fieldname": "name",
            "fieldtype": "Data",
            "width": 180,
        },
    ]
    data = []
    return columns, data
