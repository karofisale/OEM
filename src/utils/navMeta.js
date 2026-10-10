// Menu + tab của app MỘT CHỖ: id, nhãn, icon (Đợt 2 / mục 7).
//
// Quy tắc: MỖI mục menu/tab một icon RIÊNG, không trùng trong toàn app. Khi menu
// thu gọn chỉ còn icon thì phải phân biệt được từng chức năng. Trước đây: PieChart
// dùng cho cả nhóm "Doanh thu" lẫn "Báo cáo doanh thu"; BarChart3 cho cả "Tổng quan
// Metric" lẫn tiêu đề Báo cáo; ClipboardList/ClipboardCheck lặp ở 4 chỗ.
//
// `icon` là TÊN icon (chuỗi) để test kiểm tra trùng không cần dựng React; `iconOf`
// đổi tên thành component. Chỉ import đúng các icon dùng tới (tree-shaking của Vite).

import {
  Bot, ClipboardList, TrendingUp, PieChart, LayoutDashboard, History, Package, Users,
  CalendarRange, CalendarClock, Wallet, LayoutList, BadgeDollarSign, BadgeCheck, Calculator,
  Coins, Boxes, Eye, FilePenLine, ClipboardCheck, Target, Rows3, CheckCheck, NotebookPen,
  FileUp, Table2, User, Calendar, CalendarDays
} from 'lucide-react';

const ICONS = {
  Bot, ClipboardList, TrendingUp, PieChart, LayoutDashboard, History, Package, Users,
  CalendarRange, CalendarClock, Wallet, LayoutList, BadgeDollarSign, BadgeCheck, Calculator,
  Coins, Boxes, Eye, FilePenLine, ClipboardCheck, Target, Rows3, CheckCheck, NotebookPen,
  FileUp, Table2, User, Calendar, CalendarDays
};

export const iconOf = (name) => ICONS[name] || null;

/** Mục menu bên trái. `children` = nhóm sổ xuống (id con là activeTab thật). */
export const NAV = [
  { id: 'ai-agent', label: 'AI Nhận Đơn Hàng', icon: 'Bot' },
  { id: 'pending-orders', label: 'Đơn Hàng Chờ Duyệt', icon: 'ClipboardList' },
  {
    id: 'doanh-thu', label: 'Doanh thu', icon: 'TrendingUp', children: [
      { id: 'revenue-reports', label: 'Báo cáo doanh thu', icon: 'PieChart' },
      { id: 'dashboard', label: 'Tổng quan Metric', icon: 'LayoutDashboard' },
      { id: 'transactions', label: 'Lịch sử doanh thu', icon: 'History' }
    ]
  },
  { id: 'products', label: 'Sản phẩm & Bảng giá', icon: 'Package' },
  { id: 'clients', label: 'Khách hàng OEM', icon: 'Users' },
  { id: 'sales-plan', label: 'Kế hoạch kinh doanh', icon: 'CalendarRange' },
  { id: 'sop', label: 'Kế hoạch SOP', icon: 'CalendarClock' },
  { id: 'debt-importer', label: 'Công nợ', icon: 'Wallet' }
];

/** Mọi id tab thật (lá của NAV). */
export const TAB_IDS = NAV.flatMap((m) => (m.children ? m.children.map((c) => c.id) : [m.id]));

/** Vai trò 'account' (kế toán) chỉ được vào 3 mục này (2026-08-26). */
export const ACCOUNT_TAB_IDS = ['products', 'clients', 'debt-importer'];

export const TAB_DEFAULT = 'ai-agent';

/** Vai trò làm việc chính là XEM báo cáo / duyệt (không phải lên đơn): mặc định vào Báo cáo doanh thu (Đợt 3). */
export const VAI_TRO_BAO_CAO = ['admin', 'leader', 'lead'];
export const TAB_BAO_CAO = 'revenue-reports';

/**
 * Tab mở đầu khi CHƯA có tab nào được nhớ: kế toán -> mục đầu của họ; admin/leader -> báo cáo doanh thu;
 * còn lại (Sale, Creator...) -> AI Nhận Đơn Hàng, vì lên đơn là việc hằng ngày của họ.
 */
export function tabMacDinh(role) {
  const r = String(role || '').toLowerCase();
  if (r === 'account') return ACCOUNT_TAB_IDS[0];
  if (VAI_TRO_BAO_CAO.includes(r)) return TAB_BAO_CAO;
  return TAB_DEFAULT;
}

/** Tab mở đầu hợp lệ cho vai trò: tab đã nhớ nếu còn hợp lệ, không thì mặc định của vai trò. */
export function tabHopLe(tab, role) {
  const mac = tabMacDinh(role);
  if (!TAB_IDS.includes(tab)) return mac;
  if (role === 'account' && !ACCOUNT_TAB_IDS.includes(tab)) return mac;
  return tab;
}

/** Tab con của từng màn. */
export const SUBTABS = {
  products: [
    { id: 'catalog', label: 'Danh Mục', icon: 'LayoutList' },
    { id: 'propose', label: 'Đề Xuất Giá', icon: 'BadgeDollarSign' },
    { id: 'approve', label: 'Chờ Duyệt', icon: 'BadgeCheck' },
    { id: 'calculator', label: 'Tính Giá', icon: 'Calculator' },
    { id: 'cost', label: 'Giá Vốn', icon: 'Coins' },
    { id: 'kits', label: 'Bộ SP', icon: 'Boxes' }
  ],
  'sales-plan': [
    { id: 'view', label: 'Xem Kế Hoạch', icon: 'Eye' },
    { id: 'propose', label: 'Đề Xuất', icon: 'FilePenLine' },
    { id: 'approve', label: 'Chờ Duyệt', icon: 'ClipboardCheck' },
    { id: 'kpi', label: 'KPI Năm', icon: 'Target' }
  ],
  sop: [
    { id: 'view', label: 'Xem SOP', icon: 'Rows3' },
    { id: 'plan', label: 'Lập Kế Hoạch', icon: 'NotebookPen' },
    { id: 'approve', label: 'Chờ Duyệt', icon: 'CheckCheck' }
  ],
  'revenue-reports': [
    { id: 'dt-sale', label: 'DT Sale', icon: 'User' },
    { id: 'dt-thang', label: 'DT Tháng', icon: 'Calendar' },
    { id: 'kh-date', label: 'DT Ngày', icon: 'CalendarDays' }
  ],
  'debt-importer': [
    { id: 'view', label: 'Bảng Công Nợ', icon: 'Table2' },
    { id: 'import', label: 'Nhập Excel', icon: 'FileUp' }
  ]
};

/** Mọi icon dùng cho menu + tab (để test kiểm trùng). */
export function moiIcon() {
  const out = [];
  NAV.forEach((m) => {
    out.push({ where: m.id, icon: m.icon });
    (m.children || []).forEach((c) => out.push({ where: c.id, icon: c.icon }));
  });
  Object.keys(SUBTABS).forEach((k) => SUBTABS[k].forEach((t) => out.push({ where: k + '/' + t.id, icon: t.icon })));
  return out;
}
