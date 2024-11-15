const mongoose = require("mongoose");

const Schema = mongoose.Schema;

const ProgramSchema = new Schema({
    uuid: {
        type: String,
        default: "",
    },
    name: {
        type: String,
        default: "",
    },
    contact_email: {
        type: String,
        default: "",
    },
    commission_in_percentage: {
        type: Number,
        default: 0.0,
    },
    commission_in_percentage_formatted: {
        type: String,
        default: "",
    },
    commission_amount: {
        type: Number,
        default: 0,
    },
    commission_amount_formatted: {
        type: String,
        default: "",
    },
    duration: {
        type: String,
        default: "",
    },
    cash_limit: {
        type: String,
        default: "",
    },
    cash_limit_per_referal: {
        type: String,
        default: "",
    },
    promoted: {
        type: Number,
        default: 0,
    },
    is_international: {
        type: Number,
        default: 0,
    },
    commission_type: {
        type: Object,
        default: "",
    },
    product_type: {
        type: Object,
        default: null,
    },
    platform: {
        type: Object,
        default: null,
    },
    tags: {
        type: Array,
        default: [],
    },
    langs: {
        type: Array,
        default: [],
    },
    current_user_apply: {
        type: Array,
        default: [],
    },
    current_favorite_user: {
        type: Array,
        default: [],
    },
    average_ratings: {
        type: Array,
        default: [],
    },
    current_user_review: {
        type: Array,
        default: [],
    },
    link_data: {
        type: Object,
        default: null,
    },
});

const Program = mongoose.model("programs", ProgramSchema);

module.exports = Program;
