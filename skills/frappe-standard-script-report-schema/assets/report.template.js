// Copyright (c) __YEAR__, __APP_PUBLISHER__ and contributors
// For license information, please see license.txt

frappe.query_reports["__REPORT_NAME__"] = {
    filters: [
        {
            fieldname: "company",
            label: __("Company"),
            fieldtype: "Link",
            options: "Company",
        },
    ],
};
