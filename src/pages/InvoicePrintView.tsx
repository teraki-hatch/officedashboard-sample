import type { InvoiceFull } from '../features/invoices/types';
import './InvoicePrintView.css';

type Props = {
  invoice: InvoiceFull;
};

function formatYen(n: number): string {
  return `¥${n.toLocaleString()}`;
}

function formatDate(s: string): string {
  const d = new Date(s);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function formatInvoiceNumberDate(issueDate: string): string {
  return issueDate.replace(/-/g, '');
}

export default function InvoicePrintView({ invoice }: Props) {
  const items10 = invoice.items.filter((i) => i.tax_rate === 10);
  const items8 = invoice.items.filter((i) => i.tax_rate === 8);

  const subtotal10 = items10.reduce((s, i) => s + i.amount, 0);
  const tax10 = Math.floor(subtotal10 * 0.1);
  const subtotal8 = items8.reduce((s, i) => s + i.amount, 0);
  const tax8 = Math.floor(subtotal8 * 0.08);

  const totalAmount = subtotal10 + tax10 + subtotal8 + tax8;

  const displayItems = invoice.items.map((i) => {
    const unitPriceTaxIncluded = i.tax_rate === 8
      ? Math.floor(i.unit_price * 1.08)
      : Math.floor(i.unit_price * 1.1);
    const amountTaxIncluded = unitPriceTaxIncluded * i.quantity;
    return {
      description: i.description,
      tax_rate: i.tax_rate,
      unit_price_incl: unitPriceTaxIncluded,
      quantity: i.quantity,
      amount_incl: Math.floor(amountTaxIncluded),
    };
  });

  // 1ページに収めるため13行
  const PADDED_ROWS = 13;
  const emptyRowsCount = Math.max(0, PADDED_ROWS - displayItems.length);

  return (
    <div className="invoice-print">
      {/* タイトル */}
      <h1 className="invoice-print__title">請　求　書</h1>

      {/* ヘッダー: 左=宛先+ご請求金額 / 右=請求情報+発行元 */}
      <div className="invoice-print__header">
        <div className="invoice-print__header-left">
          {/* 宛先 */}
          <div className="invoice-print__addressee">
            <span className="invoice-print__addressee-name">
              {invoice.client?.name || '(クライアント不明)'}
            </span>
            <span className="invoice-print__addressee-suffix">御中</span>
          </div>
          <div className="invoice-print__addressee-underline" />
          <div className="invoice-print__intro">下記の通りご請求申し上げます。</div>

          {/* ご請求金額 */}
          <div className="invoice-print__amount-wrap">
            <div className="invoice-print__amount-block">
              <span className="invoice-print__amount-label">ご　請　求　金　額</span>
              <span className="invoice-print__amount-value">{formatYen(totalAmount)}</span>
              <span className="invoice-print__amount-suffix">(税込)</span>
            </div>
            <div className="invoice-print__amount-underline" />
          </div>
        </div>

        <div className="invoice-print__header-right">
          {/* 請求情報 */}
          <div className="invoice-print__meta">
            <div>請求日:{formatDate(invoice.issue_date)}</div>
            <div>請求番号:{invoice.client?.client_code || '---'}-{formatInvoiceNumberDate(invoice.issue_date)}</div>
            <div>登録番号:T4290003010427</div>
          </div>

          {/* 発行元 */}
          <div className="invoice-print__issuer">
            <div>合同会社As Partner</div>
            <div>〒813-0013</div>
            <div>福岡県福岡市東区香椎駅前1丁目18-12</div>
            <div>フラット・フルス　3F-B</div>
            <div>TEL:092-410-2039</div>
            <div>E-Mail:teraki@as-partner.biz</div>
            <div>担当:寺木　美鈴</div>
            <img
              src="/company-stamp.png"
              alt="社判"
              className="invoice-print__stamp"
            />
          </div>
        </div>
      </div>

      {/* 明細テーブル */}
      <table className="invoice-print__table">
        <thead>
          <tr>
            <th className="invoice-print__col-desc">品 番・品 名</th>
            <th className="invoice-print__col-rate">税率</th>
            <th className="invoice-print__col-unit">単価(税込)</th>
            <th className="invoice-print__col-qty">数 量</th>
            <th className="invoice-print__col-amount">金 額(税込)</th>
          </tr>
        </thead>
        <tbody>
          {displayItems.map((it, idx) => (
            <tr key={idx}>
              <td>{it.description}</td>
              <td className="invoice-print__center">{it.tax_rate}%</td>
              <td className="invoice-print__num">{formatYen(it.unit_price_incl)}</td>
              <td className="invoice-print__center">{it.quantity}</td>
              <td className="invoice-print__num">{formatYen(it.amount_incl)}</td>
            </tr>
          ))}
          {Array.from({ length: emptyRowsCount }).map((_, i) => (
            <tr key={`empty-${i}`}>
              <td>&nbsp;</td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
            </tr>
          ))}
          <tr className="invoice-print__total-row">
            <td colSpan={4} className="invoice-print__center">合計(税込)</td>
            <td className="invoice-print__num invoice-print__total-amount">
              {formatYen(totalAmount)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* 税率別内訳 */}
      <div className="invoice-print__tax-breakdown">
        <table>
          <tbody>
            <tr>
              <th className="invoice-print__tax-label">10%<br />対象</th>
              <td className="invoice-print__num">{formatYen(subtotal10 + tax10)}</td>
              <th className="invoice-print__tax-label">消費税</th>
              <td className="invoice-print__num">{formatYen(tax10)}</td>
            </tr>
            <tr>
              <th className="invoice-print__tax-label">8%<br />対象</th>
              <td className="invoice-print__num">{formatYen(subtotal8 + tax8)}</td>
              <th className="invoice-print__tax-label">消費税</th>
              <td className="invoice-print__num">{formatYen(tax8)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 備考 */}
      <div className="invoice-print__notes">
        <div className="invoice-print__notes-header">備　考</div>
        <div className="invoice-print__notes-body">
          {invoice.notes && (
            <div className="invoice-print__notes-custom">{invoice.notes}</div>
          )}
          <div>いつもご利用いただきありがとうございます。</div>
          <div>振込先:西日本シティ銀行　千早支店(普通)3341543　口座名義「ド)アズパートナー」</div>
          <div>お振込み手数料は御社ご負担にてお願いいたします。</div>
          <div>お支払い期限:{formatDate(invoice.due_date)}</div>
        </div>
      </div>
    </div>
  );
}
