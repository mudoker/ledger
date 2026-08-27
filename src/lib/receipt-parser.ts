export interface DetectedItem {
    id: string;
    name: string;
    price: number;
    quantity: number;
}

export interface DetectedCharge {
    name: string;
    amount: number;
    type: 'fixed' | 'percent';
}

export interface DetectedBill {
    items: DetectedItem[];
    globalCharges: DetectedCharge[];
}

/**
 * Parse raw OCR text from a receipt into structured items and charges.
 * Handles VND-style prices, quantity columns, and tax/service detection.
 */
export const parseReceiptText = (text: string): DetectedBill => {
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    const items: DetectedItem[] = [];
    const globalCharges: DetectedCharge[] = [];

    const priceRegex = /([\d.,]+)\s*(?:d|đ|VND|k)?\s*$/i;

    const ignorePatterns = [
        /total/i, /subtotal/i, /gratuity/i,
        /thành tiền/i, /tổng/i, /tiền mặt/i, /trả lại/i, /thối lại/i,
        /món ăn/i, /đơn giá/i, /số lượng/i, /thanh toán/i, /tạm tính/i, /tiền thừa/i,
        /check/i, /thu ngân/i, /khách/i, /bàn/i, /giờ/i, /ngày/i
    ];

    const taxRegex = /(?:tax|vat|thuế|gtgt)/i;
    const serviceRegex = /(?:service|phí dịch vụ|svc|phụ thu)/i;

    lines.forEach(line => {
        if (ignorePatterns.some(pattern => pattern.test(line))) return;

        const match = line.match(priceRegex);
        if (match) {
            const rawPrice = match[1];
            let price = parseFloat(rawPrice.replace(/\D/g, ''));

            if (rawPrice.toLowerCase().includes('k') || line.toLowerCase().endsWith('k')) {
                price *= 1000;
            }

            if (price < 500) return;

            if (taxRegex.test(line)) {
                globalCharges.push({ name: "Tax (VAT)", amount: price, type: 'fixed' });
                return;
            }
            if (serviceRegex.test(line)) {
                globalCharges.push({ name: "Service Charge", amount: price, type: 'fixed' });
                return;
            }

            let remainder = line.replace(match[0], '').trim();

            let quantity = 1;
            const qtyColRegex = /\s+(\d+([.,]\d{1,2})?)\s*$/;
            const qtyMatch = remainder.match(qtyColRegex);

            if (qtyMatch) {
                const rawQty = qtyMatch[1].replace(',', '.');
                const q = parseFloat(rawQty);
                if (!isNaN(q) && q > 0 && q < 1000) {
                    quantity = q;
                    remainder = remainder.replace(qtyMatch[0], '').trim();
                }
            } else {
                const leadingQtyRegex = /^(\d+)\s*[xX]?\s+/;
                const leadingMatch = remainder.match(leadingQtyRegex);
                if (leadingMatch) {
                    const q = parseInt(leadingMatch[1]);
                    if (!isNaN(q) && q > 0 && q < 100) {
                        quantity = q;
                        remainder = remainder.replace(leadingMatch[0], '').trim();
                    }
                }
            }

            const namePart = remainder.replace(/^[.,\-:]+/, '').trim();
            if (namePart.length < 2) return;

            items.push({
                id: crypto.randomUUID(),
                name: namePart,
                price,
                quantity
            });
        }
    });

    return { items, globalCharges };
};
