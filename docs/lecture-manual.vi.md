# Hướng dẫn chương trình học và quyền truy cập

Trạng thái: thiết kế đã thống nhất ngày 13 tháng 9 năm 2026, chưa triển khai đầy đủ. Tên nút dưới đây là nhãn dự kiến.

Tài liệu này dành cho giáo viên. [RFC-18](plans/RFC-18-2026-09-13-curriculum-and-content-access.md) ghi các quy tắc kỹ thuật. [PRODUCT.md](../PRODUCT.md) mô tả chức năng đang có.

## Chọn chương trình và gói truy cập riêng biệt

Khi cấp quyền cho học sinh, thầy cô chọn 2 thông tin:

| Thông tin | Các lựa chọn | Ý nghĩa |
| --- | --- | --- |
| Chương trình được học | Khối 10, Khối 11, Khối 12, THPT, ĐGNL | Học sinh học những chương trình nào |
| Gói truy cập | Tiêu chuẩn, VIP | Học sinh được xem nội dung ở mức nào |

Một học sinh có thể học nhiều chương trình nhưng chỉ có một gói truy cập trong cùng một trang dạy học.

THPT và ĐGNL là 2 chương trình độc lập. Chọn Khối 12 không tự cấp THPT. Chọn VIP không tự cấp tất cả chương trình.

Ví dụ:

| Quyền của học sinh | Được xem | Không được xem |
| --- | --- | --- |
| Khối 12 + Tiêu chuẩn | Nội dung Tiêu chuẩn trong Khối 12 | Nội dung VIP; nội dung riêng của THPT và ĐGNL |
| Khối 12 + THPT + VIP | Nội dung Tiêu chuẩn và VIP trong Khối 12 và THPT | Nội dung riêng của ĐGNL |
| Khối 11 + ĐGNL + VIP | Nội dung Tiêu chuẩn và VIP trong Khối 11 và ĐGNL | Nội dung riêng của THPT |

Nội dung công khai là ngoại lệ: mọi người đều có thể xem, không cần đăng nhập hay được cấp chương trình.

### Cấp quyền cho một học sinh

1. Mở thông tin học sinh trong trang dạy học đang quản lý.
2. Đánh dấu các mục trong “Chương trình được học”.
3. Chọn “Tiêu chuẩn” hoặc “VIP” trong “Gói truy cập”.
4. Kiểm tra câu mô tả quyền trước khi lưu.

Ví dụ: “Học sinh được xem nội dung Tiêu chuẩn và VIP trong Khối 12 và THPT.”

Quyền trên trang Toán không tự cấp quyền trên trang Tiếng Anh. Học sinh vẫn phải được duyệt và có quyền học đang hoạt động.

## Sắp xếp bài giảng theo nội dung học

Thứ tự tổ chức là:

```text
Chương trình: Khối 10
└── Chuyên đề 2: Vectơ
    └── Bài 3: Các phép toán trên vectơ
        ├── Tiết 1: Tổng và hiệu hai vectơ
        └── Tiết 2: Tích của vectơ với một số
```

“Chuyên đề” là tên chính thức trong tất cả chương trình: Khối 10, Khối 11, Khối 12, THPT và ĐGNL. Giao diện và hướng dẫn dùng thống nhất tên này, không dùng “Chương” làm tên cấp.

Mỗi tiết có một video. Một bài có thể có nhiều tiết. Chuyên đề THPT có thể ôn lại kiến thức của Khối 10, 11 và 12.

### Tìm bài giảng trong giao diện 2 vùng

Đây là hướng giao diện B đã chọn:

1. Chọn Khối 10, Khối 11, Khối 12, THPT hoặc ĐGNL ở đầu trang.
2. Chọn chuyên đề và bài trong vùng điều hướng bên trái.
3. Xem danh sách tiết của bài đã chọn ở vùng bên phải.

Trên điện thoại, chọn bài trước. Danh sách tiết thay thế vùng chọn bài. Nút quay lại danh sách giữ nguyên chương trình và chuyên đề đang chọn.

### Thêm video mới hoặc dùng lại video

1. Chọn bài cần thêm tiết.
2. Chọn “Thêm tiết”.
3. Chọn tạo video mới hoặc dùng một video đã có.
4. Kiểm tra vị trí, thứ tự và quyền xem trước khi lưu.

Một video có thể nằm trong nhiều bài hoặc nhiều chương trình. Ví dụ, video về vectơ có thể xuất hiện trong Khối 10 và THPT.

Video dùng chung có một tiêu đề, một đường dẫn YouTube và một mức truy cập. Sửa các thông tin này sẽ áp dụng cho mọi nơi sử dụng video. Số tiết và thứ tự có thể khác nhau ở mỗi bài.

“Gỡ khỏi bài” bỏ vị trí đang chọn, không xóa video. Nếu đây là vị trí cuối trong một chương trình, học sinh chỉ có chương trình đó sẽ mất quyền xem video riêng tư. Nếu không còn vị trí nào, chỉ giáo viên xem được video. Màn hình xác nhận phải báo thay đổi quyền này.

Xóa video dùng chung ảnh hưởng đến mọi vị trí; màn hình xác nhận phải liệt kê các vị trí đó.

## Chọn ai được xem nội dung

Video và bài tập có mức truy cập tối thiểu:

| Mức truy cập | Ai được xem |
| --- | --- |
| Công khai (Guest) | Mọi người, kể cả người chưa đăng nhập |
| Tiêu chuẩn (Standard) | Học sinh Tiêu chuẩn hoặc VIP có chương trình phù hợp |
| VIP | Học sinh VIP có chương trình phù hợp |

Với video dùng chung, chỉ cần một trong các chương trình chứa video phù hợp với học sinh. Học sinh không được cấp quyền vào những chương trình còn lại.

Với bài tập, giáo viên chọn trực tiếp các chương trình được truy cập. Bài tập không cần nằm trong cấu trúc chuyên đề, bài và tiết.

Quyền xem bài tập công khai không đồng nghĩa đã có chức năng làm bài không cần tài khoản. Quy trình làm bài của khách sẽ có hướng dẫn riêng khi triển khai.

### Phân biệt công khai và hiển thị

“Ai được xem” và “Hiển thị” là 2 lựa chọn khác nhau:

- “Công khai” cho phép mọi người xem khi video đang hiện.
- “Tiêu chuẩn” hoặc “VIP” giới hạn người xem nhưng vẫn hiện video cho học sinh đủ quyền.
- “Đang ẩn” ngừng hiển thị video cho học sinh và khách, kể cả khi mức truy cập là Công khai.

Ẩn video dùng chung áp dụng cho mọi vị trí. Nếu chỉ muốn bỏ video khỏi một bài, dùng “Gỡ khỏi bài”.

Giáo viên vẫn có thể xem trước video đang ẩn trong trang dạy học mình quản lý. Quy tắc bài tập đủ điều kiện xuất bản và bảo vệ đáp án vẫn áp dụng.

## Kiểm tra trước khi thay đổi quyền

- Khi thêm video vào một chương trình khác, kiểm tra nhóm học sinh mới có thể xem video.
- Khi đổi video từ VIP sang Tiêu chuẩn, nhớ rằng thay đổi áp dụng ở mọi vị trí.
- Khi chọn Công khai, nhớ rằng người xem không cần được cấp chương trình.
- Khi học sinh không xem được nội dung, kiểm tra trạng thái tài khoản, chương trình, gói truy cập và trạng thái hiển thị.

Quyền truy cập bảo vệ nội dung trong SmartClass. Đường dẫn YouTube công khai vẫn có thể được chia sẻ và xem ngoài SmartClass.
