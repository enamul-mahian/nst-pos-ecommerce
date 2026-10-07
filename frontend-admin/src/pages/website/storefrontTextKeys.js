/* Storefront label keys editable in the Website Control Center: [saved key, default text key]. */
const keyed = (area, keys) => keys.map((key) => [key, `wcc_store.defaults.${area}.${key}`]);

export const HEADER_TEXT_KEYS = keyed('header', ['call', 'currency', 'logo_subtitle', 'search_placeholder', 'search_placeholder_mobile', 'all_categories_option', 'live_suggestions', 'compare', 'wishlist', 'cart', 'account', 'sign_in', 'my_dashboard', 'my_orders', 'my_wishlist', 'logout', 'all_categories', 'view_all_categories', 'nav_home', 'nav_category', 'nav_cart', 'nav_wishlist', 'nav_account']);

export const PRODUCT_TEXT_KEYS = keyed('product', ['brand', 'add_to_compare', 'added_to_compare', 'price_on_request', 'booking_price', 'availability', 'in_stock', 'pre_order', 'out_of_stock', 'condition', 'starting_price_note', 'used_notes', 'used_badge', 'option_color', 'option_storage', 'option_ram', 'option_region', 'option_sim_type', 'option_network', 'option_condition', 'option_branch', 'choose', 'stock_count', 'stock_count_branch', 'stock_available', 'variant_preorder', 'variant_unavailable', 'preorder_min', 'select_quantity', 'quantity', 'cta_select', 'cta_unavailable', 'cta_add', 'cta_preorder', 'cta_out', 'buy_now', 'emi_available', 'emi_view', 'whatsapp', 'whatsapp_message', 'trust_authentic', 'trust_checked', 'trust_warranty', 'trust_replacement', 'trust_delivery', 'share', 'select_all_options', 'config_unavailable', 'variant_out', 'added_to_cart', 'wishlist_add', 'wishlist_remove', 'hover_zoom']);

export const POPUP_TEXT_KEYS = keyed('popup', ['someone', 'from', 'purchased', 'preordered', 'verified', 'just_now', 'minutes_ago', 'hours_ago', 'days_ago']);

/** Built-in header links; their default labels live in wcc_store.links. */
export const LINK_KEYS = ['track_order', 'store_locator', 'become_seller', 'offers', 'home', 'brands', 'phones', 'accessories', 'used_phones', 'preorder', 'blog', 'support'];
