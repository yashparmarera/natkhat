# Features & Functional Specifications

## 1. Customer Ordering Journey
1. **Browse Categories & Items**: Filter by category (Tea & Snacks, Breakfast & Parathas, Evening Snacks & Chinese, Thalis, Rice Specials, Breads, Sides) or real-time search query.
2. **Item Inspection**: Tap any dish to open the Product Details Modal, displaying portion sizes, ingredients, and preparation time.
3. **Cart Management**: Add dishes, step quantities up/down, remove items, or clear cart. Cart persists in `localStorage` across page reloads.
4. **Order Type Selection**: Switch seamlessly between **Home Delivery** and **Takeaway / Pickup**.
5. **Customer Details**: Validate required name, 10-digit mobile number, street delivery address, and kitchen notes.
6. **WhatsApp Handoff**: Formats clean, itemized WhatsApp order message and opens `https://wa.me/PHONE_NUMBER?text=ENCODED_MESSAGE`.
7. **Clear Notice**: Display prominent confirmation disclosure: "Your order will be confirmed by our café team on WhatsApp."
8. **Track Order (Takeaway)**: Enter the order number (e.g. `NC-348176`) from the home page "Track order" button, or tap "Track this order" after placing a takeaway order. The page shows Order received → Order confirmed → Preparing your order → Ready for takeaway → Collected (or Cancelled) and refreshes itself every 10 seconds. Delivery orders are confirmed on WhatsApp and are not tracked live.

## 2. Bulk & Corporate Catering Enquiries
- Form tailored for local businesses, industrial shift managers, college events, and family parties.
- Select guest count, event type, date, time, and dietary requirements.
- Generates pre-filled WhatsApp enquiry message directly to the kitchen manager.

## 3. Café Staff Management Portal (CMS)
- Accessible via `/admin` or top navigation link.
- Passcode-protected (Demo passcode: `1234`).
- **Product Management**: 1-click in-stock / sold-out toggle, price updater, add new dish, edit dish details.
- **Category Management**: Add, hide, or reorder menu sections.
- **Store Configuration**: Live update of WhatsApp phone number, calling phone, opening hours, physical address, and announcement banner text.
- **Order Audit Log**: Review all customer order requests initiated through WhatsApp handoff.
- **Order Status Updates**: Each order has an "Update status" popup that offers only the valid next steps (Order confirmed, Preparing your order, Ready for takeaway, Mark as collected, Cancel order). Customers see takeaway changes on their Track order page.
