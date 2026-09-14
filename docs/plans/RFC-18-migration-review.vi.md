# Duyệt cách sắp xếp 6 video hiện có

Trạng thái: Chinh đã duyệt vị trí và cách nhóm cho cả 6 video ngày 13 tháng 9 năm 2026. Giữ nguyên chương trình, gói truy cập và trạng thái hiển thị. Video 2 có vị trí trong cả Khối 12 và ĐGNL. Đã tạo bản ánh xạ thực thi và kiểm thử trên D1 cục bộ. Chưa thay đổi dữ liệu sản xuất.

Kiểm tra trực tiếp trang quản lý bài giảng và 6 hộp chỉnh sửa trên `toanthaythanh.com` ngày 13 tháng 9 năm 2026, khoảng 16:32–16:35 giờ Việt Nam. ID lấy từ liên kết chi tiết; tiêu đề, đường dẫn video, phần, chương trình và gói lấy từ giao diện. Cả 6 video đều đang hiện. Phiên bản API được kiểm tra sau khi đọc: [7bfcfa7](https://github.com/lelouvincx/smartclass/commit/7bfcfa72b72dea1423954992c18cd0fd73eb7ac8).

Quy tắc chuyển dữ liệu nằm trong [RFC-18](RFC-18-2026-09-13-curriculum-and-content-access.md#prepare-a-reviewed-migration-not-guessed-categories). Trước khi chuyển dữ liệu thật, cần đối chiếu lại các giá trị lưu trong cơ sở dữ liệu và quyền sở hữu workspace. Bản đọc giao diện này không thay thế bước kiểm tra đó.

## Giữ quyền xem, duyệt vị trí học

Đề xuất ban đầu giữ nguyên ID, tiêu đề video, URL YouTube, gói truy cập và trạng thái hiển thị. Không tự thêm THPT, không đổi video công khai thành VIP.

- Video 1: Tiêu chuẩn, dành cho học sinh có Khối 10 và gói Tiêu chuẩn hoặc VIP.
- Video 2–6: công khai. Chương trình dùng để tổ chức nội dung, không giới hạn người xem khi video vẫn công khai và có vị trí trong chương trình.
- Không video nào trong lần kiểm tra này được gán cả 4 chương trình hiện có.

## Dữ liệu hiện tại

Số ID cũng là thứ tự đang hiển thị trong lần kiểm tra này, không phải cam kết rằng ID luôn biểu thị thứ tự.

| ID | Tiêu đề hiện tại | Phần hiện tại | Chương trình được gán | Gói |
| --- | --- | --- | --- | --- |
| 1 | Chương 2 - Bài 3 - Các phép toán trên vecto - Tiết 1 | Lớp 12 | Khối 10 | Tiêu chuẩn |
| 2 | ĐGNL 2027 Lớp 12 - Buổi 17 | Lớp 12 | Khối 12, ĐGNL | Công khai |
| 3 | Lớp 10 - Chương 1 - Ôn kiểm tra 15 phút | Lớp 10 | Khối 10 | Công khai |
| 4 | Lớp 11 - Ôn giữa kì 1 lần 1 | Lớp 11 | Khối 11 | Công khai |
| 5 | Lớp 11 - Ôn giữa kì 1 lần 2 | Lớp 11 | Khối 11 | Công khai |
| 6 | Lớp 11 - Ôn giữa kì 1 lần 3 | Lớp 11 | Khối 11 | Công khai |

## Vị trí đã duyệt

Các tên và cách nhóm dưới đây đã được Chinh duyệt. Video 2 dùng cùng cấu trúc Chuyên đề → Bài → Tiết trong cả 2 chương trình.

| ID | Chương trình → Chuyên đề → Bài → Tiết | Trạng thái | Quyền xem |
| --- | --- | --- | --- |
| 1 | Khối 10 → Vectơ → Các phép toán trên vectơ → Tiết 1 | Đã duyệt | Không đổi |
| 2 | Khối 12 và ĐGNL, mỗi chương trình: Chuyên đề 1 → Hàm số → Tiết 1 | Đã duyệt | Vẫn công khai |
| 3 | Khối 10 → Chuyên đề 1 → Bài 5: Ôn kiểm tra 15 phút → Tiết 1 | Đã duyệt | Vẫn công khai |
| 4 | Khối 11 → Ôn tập và kiểm tra → Ôn giữa kì 1 → Tiết 1 | Đã duyệt | Vẫn công khai |
| 5 | Khối 11 → Ôn tập và kiểm tra → Ôn giữa kì 1 → Tiết 2 | Đã duyệt | Vẫn công khai |
| 6 | Khối 11 → Ôn tập và kiểm tra → Ôn giữa kì 1 → Tiết 3 | Đã duyệt | Vẫn công khai |

Video 1 có nhãn phần “Lớp 12” nhưng quyền thực tế là Khối 10. Đổi vị trí sang Khối 10 chỉ sửa cách tổ chức, không làm thay đổi nhóm học sinh được xem. Nếu chuyển sang Khối 12 hoặc thêm THPT, cần duyệt thay đổi quyền riêng.

Video 2 giữ cả Khối 12 và ĐGNL. Hai vị trí cùng tham chiếu một video, không tạo bản sao video.

Tên “Ôn tập và kiểm tra” và cách nhóm video 4–6 đã được Chinh duyệt. Đây là quyết định tổ chức, không phải kết luận sau khi xem nội dung video.

## Quyết định của người duyệt

Người duyệt: Chinh. Ngày duyệt: 13 tháng 9 năm 2026. Phản hồi: “keep all current tiers and visibility unchanged. approve this proposal”.

Giữ nguyên chương trình, gói truy cập và trạng thái đang hiện cho cả 6 video. Duyệt bảng không đồng nghĩa cho phép chạy chuyển dữ liệu trên sản xuất.

Chinh đã bổ sung:

- Video 2: “ĐGNL - Chuyên đề 1 - Hàm số - Tiết 1”, sau đó xác nhận “both”: giữ cả ĐGNL và Khối 12 với cùng cấu trúc.
- Video 3: “lớp 10 - Chương 1 - Bài 5 - Ôn kiểm tra 15 phút”. Dùng tên chính thức “Chuyên đề 1” trong cấu trúc mới; giữ Tiết 1 đã duyệt.

Không còn câu hỏi phân loại. [Bản ánh xạ thực thi](../../worker/db/curriculum-mapping.json) tạo 5 chuyên đề, 5 bài và 7 vị trí video. Kiểm thử cục bộ xác nhận giữ nguyên các trường video và chương trình cũ. Agent phải đối chiếu lại dữ liệu nguồn trước khi đề nghị chuyển dữ liệu sản xuất.

## Đường dẫn nguồn

| ID | Video YouTube đã lưu |
| --- | --- |
| 1 | https://www.youtube.com/watch?v=e8HFyBr2Szs |
| 2 | https://www.youtube.com/watch?v=YbZisBWeJTo |
| 3 | https://youtu.be/qh3feEwyqhs |
| 4 | https://youtu.be/opcwvFe9fwA |
| 5 | https://youtu.be/mfB6L_wIGmI |
| 6 | https://youtu.be/iT4uk8PBFvk |
