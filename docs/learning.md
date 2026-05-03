# UI/UX Learning from Other Platforms

## Shub.edu.vn

Reference: https://shub.edu.vn/shared/homework/3398797

### Exercise Info Card (Pre-Start Landing Page)

- **Layout**: Split-screen — blue background with brand logo on the left, white floating card (rounded corners, drop shadow) on the right
- **Card structure**:
  - Title centered at top in bold
  - Metadata rows (label left-aligned, value right-aligned): Class, Type, Start, Deadline, Duration
  - Full-width green CTA button: "Làm bài với vai trò khách" (Take as guest) with right-arrow icon
  - Share section at bottom: copyable URL field + social icons (Facebook, Messenger, Zalo)
- **Key UX patterns**:
  - Guest-first access — no login friction, immediate engagement
  - High-contrast green button draws attention as the primary action
  - Clean, scannable metadata list — only actionable info, no timestamps clutter
  - Integrated sharing encourages distribution among students/teachers
  - Minimalist aesthetic with high whitespace focuses attention on exercise details

### Exercise Doing Page (Test-Taking UI)

- **Layout**: Two-column — scrollable question feed (left), fixed sidebar "control center" (right)
- **Question area (left column)**:
  - Vertical feed of white question cards with rounded corners and subtle drop shadow on light grey background
  - Section headers inline (e.g., "PHẦN 1: TRẮC NGHIỆM", "PHẦN 2: TRẮC NGHIỆM ĐÚNG SAI", "PHẦN 3: ĐIỀN")
  - Question label in blue text (e.g., "Câu 1") clearly marks each question start
  - LaTeX rendering for math expressions
- **MCQ answers (Part 1)**:
  - Vertical stack of 4 clickable cards (A, B, C, D)
  - Split-box design: grey letter badge on the left, answer content on the right, separated by a vertical line
  - Large tap/click targets for both desktop and mobile
- **Boolean/True-False answers (Part 2)**:
  - Question stem followed by 4 labeled sub-statements (a, b, c, d)
  - Single text input field "Nhập đáp án tại đây..." below the sub-questions
  - Students type a coded string (e.g., Đ/S for each sub-question) rather than clicking radio buttons
- **Fill-in answers (Part 3)**:
  - Same text input field pattern as boolean — "Nhập đáp án tại đây..."
  - Free-form numeric/text entry
- **Sidebar (right column)**:
  - **Timer**: Blue header block showing elapsed/remaining time ("Thời gian làm bài")
  - **Exercise info**: Small card with exercise title and current question context (e.g., "Câu 1 (0.4 điểm)")
  - **Navigation grid ("Phiếu trả lời")**: 5-column grid of numbered squares (1–25); current question highlighted with blue border; unanswered questions have faint grey border; clicking a number auto-scrolls the question feed to that question (smooth anchor navigation)
  - **Action buttons**: Fixed at sidebar bottom — grey "Rời khỏi" (Exit) and blue "Nộp bài" (Submit)
- **Key UX patterns**:
  - Sidebar as persistent "Control Center" — monitor progress and time without losing scroll position
  - Non-linear navigation via grid — students can jump to any question instantly
  - Card-based containers with whitespace prevent visual overload during testing
  - Large touch-friendly targets optimized for mobile
  - Clear visual distinction between question types via different input methods
  - Point value shown per question in sidebar (e.g., "0.4 điểm")

### Answer Selection Feedback

- **Selected answer**: Blue background fill on the chosen option card + blue border; an "✗" deselect button appears on the far right of the selected row
- **Navigation grid updates live**: Answered questions show `"1:A"`, `"2:B"` (number + chosen letter); unanswered show just the number
- **Deselect support**: Students can click the ✗ button to clear their answer

### Submit Confirmation Dialog

- **Trigger**: Clicking "Nộp bài" opens a centered modal with dimmed backdrop
- **Title**: "Lưu ý" (Warning)
- **Dynamic message**: "Bạn có **23** câu chưa làm, bạn có chắc chắn muốn nộp bài?" — tells the exact count of unanswered questions
- **Buttons**: Grey "Thoát" (Cancel) on left, blue "Đồng ý" (Confirm) on right
- **UX pattern**: Interventionist blocking modal to prevent accidental incomplete submission; data-driven feedback (exact unanswered count)

### Results Summary Page (Post-Submit)

- **Layout**: Same split-screen as landing page — logo left, white card right
- **Score display**: Dark blue header block with large white text: `"0.8/10 điểm"`
- **Submission metadata**: Name, duration ("4 phút 49 giây"), submission timestamp
- **Correctness summary** (color-coded dots):
  - 🟢 Green dot: "Số câu đúng" (correct count)
  - 🔴 Red dot: "Số câu sai" (incorrect count)
  - ⚪ Grey dot: "Số câu chưa làm" (unanswered count)
- **CTA**: Full-width green button "Xem chi tiết kết quả" (View detailed results)
- **Class metadata**: Class name, class code, teacher name shown at bottom
- **Share section**: Same as landing page (copy link + social icons)

### Detailed Results Review Page

- **Layout**: Two-column — question review (left), answer sheet sidebar (right)
- **Top bar**:
  - "Quay lại" (Back) button top-left
  - "Lời giải" (Solution) toggle top-right — teacher can enable/disable solution visibility
  - Toggle between "Đề học sinh làm" (Student version) and "Đề gốc" (Original version)
  - Tabs: "Kết quả" (Results) vs "Lịch sử" (History) for multiple attempts
- **Question review (left)**:
  - Full question text with math rendering
  - Selected answer highlighted with blue background
  - Correct answer visibility is teacher-controlled — can be hidden with notice: "Giáo viên đã tắt tính năng xem đúng sai và đáp án của bài tập này"
- **Sidebar answer sheet ("Phiếu bài làm")**:
  - Score header: blue box with `"0.8 / 10"` and grading status
  - Time taken + submission timestamp
  - Same green/red/grey dot summary as results page
  - **Per-question table**: Columns = status icon (colored dot), question number, "Chọn" (chosen answer or `-`), "Đáp án đúng" (correct answer or `-`), point value (e.g., `(0.4)`)
- **Key UX patterns**:
  - Teacher controls answer/solution visibility — prevents cheating on shared exercises
  - Multiple attempt history via tab/dropdown
  - Student vs original version toggle for comparison
  - Per-question point breakdown in sidebar table
