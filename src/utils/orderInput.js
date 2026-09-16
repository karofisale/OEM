// Chuẩn bị đầu vào cho màn "AI nhận đơn": ảnh / PDF / Excel / CSV -> đúng hai
// thứ backend cần (xem gas/Ai.gs):
//
//   files  = [{ data: base64 KHÔNG tiền tố, mimeType, name, size }]  -> Gemini đọc thẳng
//   tables = [{ name, tsv }]                                          -> chèn vào prompt dạng chữ
//
// VÌ SAO ẢNH KHÔNG GỬI NGUYÊN BẢN: ảnh chụp điện thoại giờ 3-6MB, base64 lên
// thành 4-8MB, mà đường tới Apps Script vốn hỏng chừng một nửa số lượt (xem
// services/api.js) — gói càng to càng dễ đứt giữa chừng. Thu về cạnh dài 1600px
// thì chữ trong ảnh chụp đơn/tin nhắn vẫn đọc tốt (Gemini xử lý ảnh ở mức ~768-1536px),
// gói còn 200-500KB.
//
// VÌ SAO EXCEL KHÔNG GỬI DƯỚI DẠNG FILE: Gemini không nhận .xlsx. SheetJS vốn
// đã nằm trong gói (nhập công nợ, nhập ZSD450) nên đọc ngay ở trình duyệt rồi
// gửi lên dạng bảng Tab — vừa nhẹ vừa là thứ model đọc chính xác nhất.

export const CANH_TOI_DA = 1600;
export const CHAT_LUONG_JPEG = 0.82;

// Giới hạn trước khi xử lý — chặn người dùng lỡ chọn một file khổng lồ.
export const KICH_THUOC_TOI_DA = 25 * 1024 * 1024;

// Bảng quá dài thì cắt: một đơn đặt hàng thật không có 5000 dòng, mà prompt
// phình ra chỉ làm model lạc. Cắt xong có báo cho người dùng biết.
export const SO_DONG_BANG_TOI_DA = 400;

const LA_ANH = (f) => (f.type || '').startsWith('image/');
const LA_PDF = (f) => (f.type || '') === 'application/pdf' || /\.pdf$/i.test(f.name || '');
const LA_BANG = (f) => /\.(xlsx|xls|csv)$/i.test(f.name || '') ||
  (f.type || '').includes('spreadsheet') || (f.type || '') === 'text/csv';

function docBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Không đọc được file "${file.name}".`));
    reader.onload = () => {
      const s = String(reader.result || '');
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    reader.readAsDataURL(file);
  });
}

// Thu nhỏ ảnh về cạnh dài CANH_TOI_DA rồi mã hoá JPEG. Ảnh vốn đã nhỏ hơn thì
// vẫn đi qua canvas một lượt — chuyển HEIC/PNG/WebP về JPEG luôn, khỏi phải
// đoán mimeType nào Gemini nhận.
export async function nenAnh(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`Không mở được ảnh "${file.name}" — thử lưu lại dạng JPG/PNG.`));
      el.src = url;
    });

    const canh = Math.max(img.naturalWidth, img.naturalHeight) || 1;
    const tiLe = canh > CANH_TOI_DA ? CANH_TOI_DA / canh : 1;
    const w = Math.max(1, Math.round(img.naturalWidth * tiLe));
    const h = Math.max(1, Math.round(img.naturalHeight * tiLe));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    // Ảnh chụp màn hình Zalo hay có nền trong suốt; không tô trắng thì phần đó
    // ra đen khi đổ sang JPEG và chữ biến mất.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    const dataUrl = canvas.toDataURL('image/jpeg', CHAT_LUONG_JPEG);
    return {
      data: dataUrl.slice(dataUrl.indexOf(',') + 1),
      mimeType: 'image/jpeg',
      name: file.name || 'anh.jpg',
      size: Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75),
      loai: 'anh'
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Mỗi sheet có dữ liệu -> một bảng Tab. Dòng trống ở cuối bị cắt bỏ, dòng thừa
// quá SO_DONG_BANG_TOI_DA cũng vậy (có ghi chú kèm theo để người duyệt biết).
export async function docBangTinh(file) {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });

  const bang = [];
  wb.SheetNames.forEach((ten) => {
    const ws = wb.Sheets[ten];
    if (!ws) return;
    const tsv = XLSX.utils.sheet_to_csv(ws, { FS: '\t', blankrows: false }).trim();
    if (!tsv) return;
    const dong = tsv.split('\n');
    const catBot = dong.length > SO_DONG_BANG_TOI_DA;
    bang.push({
      name: `${file.name} / ${ten}`,
      tsv: catBot
        ? dong.slice(0, SO_DONG_BANG_TOI_DA).join('\n') +
          `\n[... đã cắt bớt ${dong.length - SO_DONG_BANG_TOI_DA} dòng cuối]`
        : tsv,
      soDong: dong.length,
      catBot,
      loai: 'bang'
    });
  });

  if (!bang.length) throw new Error(`File "${file.name}" không có sheet nào chứa dữ liệu.`);
  return bang;
}

export async function docPdf(file) {
  return {
    data: await docBase64(file),
    mimeType: 'application/pdf',
    name: file.name || 'don.pdf',
    size: file.size,
    loai: 'pdf'
  };
}

/**
 * Nhận một mớ File bất kỳ, trả về { files, tables, loi }.
 * `loi` là danh sách câu báo cho file không xử lý được — KHÔNG ném lỗi, để
 * chọn nhầm một file trong năm file không làm hỏng cả lượt.
 */
export async function chuanBiDinhKem(danhSachFile) {
  const files = [];
  const tables = [];
  const loi = [];

  for (const file of Array.from(danhSachFile || [])) {
    try {
      if (file.size > KICH_THUOC_TOI_DA) {
        loi.push(`"${file.name}" nặng ${(file.size / 1024 / 1024).toFixed(1)}MB — vượt giới hạn ${KICH_THUOC_TOI_DA / 1024 / 1024}MB.`);
        continue;
      }
      if (LA_ANH(file)) files.push(await nenAnh(file));
      else if (LA_PDF(file)) files.push(await docPdf(file));
      else if (LA_BANG(file)) (await docBangTinh(file)).forEach((b) => tables.push(b));
      else loi.push(`"${file.name}" không phải ảnh, PDF hay Excel/CSV — đã bỏ qua.`);
    } catch (err) {
      loi.push(err.message || `Không xử lý được "${file.name}".`);
    }
  }

  return { files, tables, loi };
}

export function moTaKichThuoc(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
