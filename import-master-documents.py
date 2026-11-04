"""Import supplied Office documents without losing XLSX column positions.
Run explicitly when the supplied reference package changes; never modifies originals.
"""
from pathlib import Path
import hashlib
import json
import posixpath
import zipfile
import xml.etree.ElementTree as ET

BASE = Path(r'C:\Users\cline\OneDrive\Documents\카카오톡 받은 파일')
OUT = Path('src/data/master')
FILES = [
    ('uat', 'UAT검수 시나리오_2026-11-01.docx'),
    ('questions', '정책자금 질문은행 100선_2026-11-01.xlsx'),
    ('platform', '정책자금 플랫폼 개발자료_2026-11-01.docx'),
    ('rules', '룰기관별 최신정책_DB_2026-11-01.xlsx'),
    ('collection', '굥공데이터 수집안_2026-11-01.docx'),
    ('sample-five', '가격대별 테스트 샘플5선 _2026-11-01.docx'),
    ('sample-tiers', '가격대별 샘플_2026-11-01.docx'),
]
S = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
W = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}

def text(node, tag, ns):
    return ''.join(n.text or '' for n in node.findall('.//' + tag, ns))

def parse_xlsx(z):
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        shared = [text(n, 's:t', S) for n in ET.fromstring(z.read('xl/sharedStrings.xml'))]
    rels = {n.attrib['Id']: n.attrib['Target'] for n in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
    result = {}
    for sheet in ET.fromstring(z.read('xl/workbook.xml')).findall('.//s:sheet', S):
        target = rels[sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
        target = target.lstrip('/') if target.startswith('/') else posixpath.normpath('xl/' + target)
        rows = []
        for row in ET.fromstring(z.read(target)).findall('.//s:row', S):
            cells = []
            for cell in row.findall('s:c', S):
                letters = ''.join(c for c in cell.attrib['r'] if c.isalpha())
                col = 0
                for c in letters: col = col * 26 + ord(c) - 64
                while len(cells) < col: cells.append('')
                v = cell.find('s:v', S)
                value = v.text if v is not None and v.text else ''
                if cell.attrib.get('t') == 's': value = shared[int(value)]
                elif cell.attrib.get('t') == 'inlineStr': value = text(cell, 's:t', S)
                cells[col - 1] = value
            if any(cells): rows.append({'row': int(row.attrib['r']), 'cells': cells})
        result[sheet.attrib['name']] = rows
    return result

def parse_docx(z):
    body = ET.fromstring(z.read('word/document.xml')).find('w:body', W)
    blocks = []
    for n in body:
        if n.tag.endswith('}p'):
            value = text(n, 'w:t', W)
            if value.strip(): blocks.append(value)
        elif n.tag.endswith('}tbl'):
            blocks.append([[text(c, 'w:t', W) for c in row.findall('w:tc', W)] for row in n.findall('w:tr', W)])
    return blocks

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = []
    for key, name in FILES:
        data = (BASE / name).read_bytes()
        with zipfile.ZipFile(BASE / name) as z:
            content = parse_xlsx(z) if name.endswith('.xlsx') else parse_docx(z)
        (OUT / (key + '.json')).write_text(json.dumps(content, ensure_ascii=False, indent=2), encoding='utf-8')
        manifest.append({'id': key, 'file': name, 'sha256': hashlib.sha256(data).hexdigest(), 'referenceDate': '2026-11-01', 'status': 'USER_SUPPLIED_REFERENCE', 'count': {s: len(rows) for s, rows in content.items()} if isinstance(content, dict) else len(content)})
    (OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    questions = json.loads((OUT / 'questions.json').read_text(encoding='utf-8'))
    cores = {}
    for row in questions['Q&A_1000'][1:]:
        c = row['cells']
        core = cores.setdefault(c[1], {'id': c[1], 'category': c[2], 'question': c[5], 'intent': c[15], 'nextQuestion': c[16], 'requiredDocs': c[17], 'institutions': c[18], 'reviewStatus': c[21], 'variants': [], 'source': {'document': 'questions', 'sheet': 'Q&A_1000', 'row': row['row'], 'referenceDate': '2026-11-01'}})
        core['variants'].append({'id': c[0], 'text': c[4], 'tags': c[6:15], 'row': row['row']})
    (OUT / 'question-bank.json').write_text(json.dumps(list(cores.values()), ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    samples = json.loads((OUT / 'sample-five.json').read_text(encoding='utf-8'))
    cases = []
    for block in samples:
        if isinstance(block, str) and block.startswith('3. CASE'):
            pass
        if isinstance(block, str) and 'CASE ' in block and 'GT2-' in block:
            cases.append({'id': block.split('GT2-')[1][:3], 'title': block, 'sections': []})
        elif cases:
            cases[-1]['sections'].append(block)
    (OUT / 'sample-cases.json').write_text(json.dumps(cases, ensure_ascii=False, indent=2), encoding='utf-8')
    print('Imported 7 original documents; hashes and row/column provenance preserved.')
    for item in manifest: print(item['id'], item['count'])

if __name__ == '__main__': main()
