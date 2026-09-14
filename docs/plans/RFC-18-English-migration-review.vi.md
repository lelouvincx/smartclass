# Duyệt cách sắp xếp 6 video tiếng Anh hiện có

Trạng thái: Chinh đã duyệt cấu trúc phân cấp cho 6 video tiếng Anh hiện có ngày 14 tháng 9 năm 2026. Bản duyệt này chỉ ghi nhận cách xếp chương trình, chuyên đề, bài và tiết. Chưa có quyền chạy chuyển dữ liệu sản xuất.

Nguồn kiểm tra là bản chụp dữ liệu sản xuất đã đóng băng tại `.amp/in/curriculum-release-recovery/production-inventory.json`, commit `8d849a08457f4596e7d7d417e59bb1daa42c45cf`, chụp lúc `2026-09-14T16:07:48.384Z`. Bản ánh xạ thực thi nằm tại `worker/db/english-curriculum-mapping.json`.

## Quy tắc đã duyệt

Mỗi chương trình tiếng Anh hiện có giữ cùng một cấu trúc:

`Chuyên đề 1: Verb tenses → Bài 1: Verb tenses → Tiết 1–6`

Áp dụng cho 4 chương trình:

- Khối 10
- Khối 11
- Khối 12
- ĐGNL

Không thêm THPT. Không sao chép ánh xạ Toán. Mỗi video vẫn là một video dùng chung, được đặt vào bài tương ứng của cả 4 chương trình.

## Dữ liệu nguồn được giữ nguyên

Các ID, tiêu đề, URL YouTube, trạng thái hiển thị và gói truy cập dưới đây phải giữ đúng theo bản chụp sản xuất.

| ID | Tiêu đề | URL YouTube | Hiển thị | Gói |
| --- | --- | --- | --- | --- |
| 7 | Chuyên đề 1 (verb tense) - Buổi 1 | https://youtu.be/ziwr2BKuPeI | 1 | Guest |
| 8 | Chuyên đề 1 (Verb tenses) - Buổi 2 | https://youtu.be/B1rH1yF_hRw | 1 | Guest |
| 9 | Chuyên đề 1 (Verb tenses) - Buổi 3 | https://youtu.be/kezIUPvmJ2Q | 1 | Standard |
| 10 | Chuyên đề 1 (Verb tenses) - Buổi 4 | https://youtu.be/WXH0insEVY0 | 1 | Standard |
| 11 | Chuyên đề 1 (Verb tense) - Buổi 5 | https://youtu.be/gAoThZ0iooY | 1 | Standard |
| 12 | Chuyên đề 1 (Verb tenses) - Buổi 6 | https://youtu.be/dy6mlQDnYBI | 1 | Standard |

Thứ tự nguồn đã duyệt là: 7, 8, 9, 10, 11, 12.

## Vị trí đã duyệt

Mỗi ID có 4 vị trí, một vị trí trong mỗi chương trình. Các vị trí dùng cùng video, không tạo video mới.

| ID | Vị trí trong mỗi chương trình | Thứ tự tiết |
| --- | --- | --- |
| 7 | Chuyên đề 1: Verb tenses → Bài 1: Verb tenses | Tiết 1 |
| 8 | Chuyên đề 1: Verb tenses → Bài 1: Verb tenses | Tiết 2 |
| 9 | Chuyên đề 1: Verb tenses → Bài 1: Verb tenses | Tiết 3 |
| 10 | Chuyên đề 1: Verb tenses → Bài 1: Verb tenses | Tiết 4 |
| 11 | Chuyên đề 1: Verb tenses → Bài 1: Verb tenses | Tiết 5 |
| 12 | Chuyên đề 1: Verb tenses → Bài 1: Verb tenses | Tiết 6 |

Tổng số vị trí là 24: 6 video nhân với 4 chương trình.

## Quyết định của người duyệt

Người duyệt: Chinh. Ngày duyệt: 14 tháng 9 năm 2026.

Chinh duyệt cấu trúc phân cấp nêu trên cho workspace `english`. Quyết định này không đổi ID, tiêu đề, URL, trạng thái hiển thị hoặc gói truy cập. Video 7 và 8 vẫn là Guest. Video 9 đến 12 vẫn là Standard. Cả 4 chương trình hiện có vẫn được giữ.

Trước khi chạy trên sản xuất, agent phải kiểm tra lại dữ liệu sản xuất mới nhất và xin phê duyệt chạy rõ ràng. Bản duyệt này không thay thế bước kiểm tra mới và không cho phép tự chạy chuyển dữ liệu sản xuất.
