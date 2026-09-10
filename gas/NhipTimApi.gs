/**
 * NhipTimApi.gs — endpoint đọc nhịp tim cho app, KHÔNG cache.
 *
 * VÌ SAO KHÔNG DÙNG LẠI `getPortalStats`. Nó cũng trả `nhipTim`, nhưng nó đọc
 * trọn tab Data (lượt đọc đắt nhất của backend này) và cache 10 phút. Panel
 * "Cào từ SAP" hỏi vòng vài giây một lần để biết lượt chạy xong chưa — mà với
 * bản cache 10 phút thì mốc thời gian đứng yên suốt 10 phút, đúng cái nó cần
 * theo dõi. Cache ở đây không phải tối ưu, nó là hỏng chức năng.
 *
 * Hàm này chỉ đọc một tab nhỏ (`JobHeartbeat`, mỗi việc một dòng) nên rẻ, hỏi
 * vòng mỗi 5 giây không sao. Xem NhipTim.gs.
 *
 * KHÔNG lọc theo vai: dòng nhịp tim chỉ có tên việc, mốc thời gian và số lượng
 * dòng — không tên khách, không tiền, không mã nào. Ai vào được app cũng nên
 * biết số họ đang đọc cũ bao lâu.
 */
function oemAppGetNhipTim_(token) {
  oemAppRequireSession_(token);
  return { nhipTim: docNhipTim_(oemAppSS_()) };
}
