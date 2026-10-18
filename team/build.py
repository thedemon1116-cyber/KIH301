"""팀 공유판(claude.ai 아티팩트)용 한 파일짜리 index.html을 만듭니다.

공용 디자인(../style.css) + 팀 전용 디자인(team.css) + 화면(page.html) + 동작(team.js)을
하나로 합칩니다. 실행: python3 team/build.py
"""
import pathlib
import re

here = pathlib.Path(__file__).parent
css = (here.parent / 'style.css').read_text() + '\n' + (here / 'team.css').read_text()

# 다크 모드: 사용자가 claude.ai에서 테마를 직접 고른 경우(data-theme)도 따르도록 변환
m = re.search(r"@media \(prefers-color-scheme: dark\) \{\n  :root \{\n(.*?)\n  \}\n\}", css, re.S)
dark = m.group(1)
css = css.replace(m.group(0),
    '@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {\n' + dark
    + '\n    color-scheme: dark;\n  }\n}\n:root[data-theme="dark"] {\n' + dark + '\n  color-scheme: dark;\n}')
css = css.replace('  padding: 40px 16px;\n',
    '  padding-block: 40px;\n  padding-left: max(16px, env(safe-area-inset-left, 0px));\n'
    '  padding-right: max(16px, env(safe-area-inset-right, 0px));\n')
css = css.replace('  body { padding: 16px; }', '  body { padding-block: 16px; }')

page = (here / 'page.html').read_text()
js = (here / 'team.js').read_text()

out = (f'<title>팀 할 일 목록</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n'
       f'<style>\n{css}\n</style>\n{page}\n<script>\n{js}\n</script>\n')
(here / 'index.html').write_text(out)
print('team/index.html 생성 완료')
