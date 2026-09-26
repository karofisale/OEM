/**
 * Run.gs — BẢNG ĐIỀU KHIỂN. Mọi thao tác chạy tay của OEM App nằm ở đây.
 *
 * VÌ SAO CÓ FILE NÀY: nút Run trong trình soạn thảo Apps Script **không truyền
 * được tham số**. Hàm nào cần tham số thì bấm Run sẽ báo lỗi, và mỗi lần dùng
 * lại phải đi tra xem gõ gì vào đâu. Nên mọi việc ở đây đều là hàm KHÔNG THAM
 * SỐ: mở file này, chọn tên hàm trong danh sách trên thanh công cụ, bấm Run.
 *
 * HAI KHUÔN:
 *   Việc có ghi dữ liệu  ->  hai hàm riêng, KHÔNG phải một cờ true/false:
 *                            run_<việc>_xemTruoc() / run_<việc>_ghiThat()
 *      Tách đôi vì một cờ để quên ở trạng thái bật là ghi đè ngoài ý muốn.
 *   Việc cần giá trị     ->  hằng số VIẾT HOA ngay dòng đầu thân hàm.
 *
 * THÊM VIỆC MỚI: viết hàm nghiệp vụ ở file của nó, rồi thêm một vỏ bọc `run_*`
 * không tham số vào đây. Đừng bắt người dùng gõ tham số.
 *
 * Kết quả in ra Nhật ký thực thi (Ctrl+Enter / View > Logs).
 */


/* ==================================================================
 * PIN
 * ================================================================== */

/**
 * Xem trước việc băm PIN: bao nhiêu bản ghi còn dạng thô, bao nhiêu đã băm.
 * KHÔNG ghi gì, và KHÔNG in PIN nào ra nhật ký.
 */
function run_bamPin_xemTruoc() {
  return setup_hashAllPins(false);
}

/**
 * Băm thật mọi PIN còn dạng thô trong tab Users.
 *
 * Pepper nằm ở Script Property PIN_PEPPER của CHÍNH dự án này, tự sinh lần đầu.
 * Mất property đó là không xác thực lại được bản ghi nào — phải đặt lại PIN cho
 * tất cả. Xem chú thích đầu PinHash.gs.
 */
function run_bamPin_ghiThat() {
  return setup_hashAllPins(true);
}


/* ==================================================================
 * CHẨN ĐOÁN — chỉ đọc, chạy bao nhiêu lần cũng được
 *
 * Ba hàm này KHÔNG còn nằm trong bảng định tuyến (gỡ 2026-09-04): chúng không
 * kiểm token, và backend deploy ở chế độ "Anyone" nên để mở là ai trên internet
 * cũng gọi được. Chạy tay từ đây thì vẫn dùng được khi cần soi dữ liệu.
 * ================================================================== */

/** Bảng SOP: kỳ nào, sale nào, trạng thái gì, còn bao nhiêu dòng trùng. */
function run_chanDoan_sop() {
  return oemAppSopDiag_();
}

/** Bảng công nợ: tiêu đề cột và số dòng dữ liệu. */
function run_chanDoan_congNo() {
  return oemAppDebtDiag_();
}

/** Định nghĩa bộ sản phẩm (tab Kits) và các SKU thành phần. */
function run_chanDoan_boSanPham() {
  return oemAppKitsDiag_();
}

/** Xoá cache bootstrap, buộc lần mở app kế tiếp dựng lại từ Sheet. */
function run_xoaCacheBootstrap() {
  return oemAppForceRefreshBootstrap_();
}

/**
 * Liệt kê MỌI tab trong Sheet OEM + đối chiếu tab nào code có dùng, tab nào
 * không (xem chú thích đầu hàm ở Helpers.gs). CHỈ ĐỌC, không xoá gì.
 * Chạy xong bấm Ctrl+Enter (View > Logs) rồi copy hết dán lại cho Claude.
 */
function run_khaoSatSheet() {
  return oemAppKhaoSatSheetInBaoCao_();
}


/* ==================================================================
 * CHUYỂN SANG SUPABASE (schema oem + Edge Function oem-api)
 * Xem MigrateToSupabase.gs. Chạy theo thứ tự 1 -> 2 -> 3.
 * ================================================================== */

/** 1. Tạo secret nạp dữ liệu (chạy một lần), rồi copy sang Supabase Secrets. */
function run_supabase_1_taoSecret() {
  return migTaoSecret_();
}

/**
 * 2. Xoá sạch và nạp lại MỌI bảng schema oem từ Sheet. Chạy lại bao nhiêu lần
 * cũng được trước lúc cắt luồng — chưa ai đọc schema oem.
 */
function run_supabase_2_napDuLieu() {
  return migNapDuLieu_();
}

/** 3. Đối chiếu payload app dựng từ Sheet với payload dựng từ Postgres. Chỉ đọc. */
function run_supabase_3_doiChieu() {
  return migDoiChieu_();
}
