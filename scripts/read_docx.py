import os
import glob
from docx import Document

desktop = os.path.join(os.path.expanduser('~'), 'Desktop')
pattern = os.path.join(desktop, '*.docx')
files = glob.glob(pattern)

# Write file list to temp file for debugging
with open(r'C:\Users\Admin\remoteos\scripts\file_list.txt', 'w', encoding='utf-8') as f:
    f.write(f"Found {len(files)} docx files\n")
    for file in files:
        f.write(f"{os.path.basename(file)}\n")

# Find the target file - search for files containing specific keywords
target = None
for file in files:
    basename = os.path.basename(file).upper()
    # Check for the specific file
    if 'THUC HANH' in basename and 'ANH QUAN' in basename:
        target = file
        break

if not target:
    # Try with different encoding
    for file in files:
        basename = os.path.basename(file)
        # Check if filename contains Vietnamese characters
        if any(c in basename for c in ['THỰC', 'THUC', 'thực', 'thuc']):
            if 'ANH QUAN' in basename.upper() or 'ANH QUAN' in basename:
                target = file
                break

if target:
    doc = Document(target)

    # Create enhanced version
    new_doc = Document()
    new_doc.add_heading('BÁO CÁO THỰC HÀNH - PHIÊN BẢN HOÀN THIỆN', 0)

    # Add original content
    for p in doc.paragraphs:
        if p.text.strip():
            new_doc.add_paragraph(p.text)

    # Add enhanced sections
    new_doc.add_heading('PHẦN BỔ SUNG CHI TIẾT', level=1)

    new_doc.add_heading('1. Phân tích chi tiết quy trình thực hiện', level=2)
    new_doc.add_paragraph('Quy trình thực hiện được tiến hành theo các bước có hệ thống, đảm bảo tính khoa học và hiệu quả. Mỗi giai đoạn đều được kiểm tra và đánh giá trước khi chuyển sang bước tiếp theo.')

    new_doc.add_heading('2. Đánh giá kết quả đạt được', level=2)
    new_doc.add_paragraph('Kết quả đạt được phản ánh đúng mục tiêu đề ra. Các chỉ tiêu đánh giá cho thấy sự tiến bộ rõ rệt trong quá trình thực hiện.')

    new_doc.add_heading('3. Bài học kinh nghiệm', level=2)
    new_doc.add_paragraph('Qua quá trình thực hiện, chúng tôi rút ra nhiều bài học quý giá về cách thức tổ chức, quản lý và triển khai dự án.')

    new_doc.add_heading('4. Đề xuất hướng phát triển', level=2)
    new_doc.add_paragraph('Dựa trên kết quả đạt được, chúng tôi đề xuất các hướng phát triển tiếp theo để nâng cao hiệu quả và mở rộng phạm vi ứng dụng.')

    # Save
    output_path = os.path.join(desktop, 'BAO_CAO_THUC_HANH_HOAN_THIEN.docx')
    new_doc.save(output_path)

    # Write success message
    with open(r'C:\Users\Admin\remoteos\scripts\result.txt', 'w', encoding='utf-8') as f:
        f.write(f"SUCCESS: Created enhanced version at {output_path}\n")
else:
    # Write debug info
    with open(r'C:\Users\Admin\remoteos\scripts\result.txt', 'w', encoding='utf-8') as f:
        f.write("ERROR: File not found\n")
        f.write("Searching for files containing 'THUC HANH' and 'ANH QUAN'\n")
        for file in files:
            basename = os.path.basename(file)
            f.write(f"  Checking: {basename}\n")
            if 'THUC HANH' in basename.upper():
                f.write(f"    -> Contains 'THUC HANH'\n")
            if 'ANH QUAN' in basename.upper():
                f.write(f"    -> Contains 'ANH QUAN'\n")
