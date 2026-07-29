// PaperTrail 예제 템플릿 — 교육 이수 통지서 (Training Completion Notice)
//
// Papermake 는 렌더 시 요청 본문의 data 를 전역 `#data` 로 주입한다.
// 이 템플릿은 중첩 필드, 배열 반복(table), 조건 분기를 모두 사용해 데이터 바인딩을 보여준다.
//
// 한글은 FONTS_DIR(/fonts)에 마운트한 NanumGothic(OFL)로 렌더된다.
// (docker-compose 의 papermake 볼륨 마운트 참고)

#set page(paper: "a4", margin: (x: 2.2cm, y: 2cm))
#set text(font: "NanumGothic", size: 10.5pt)

#align(center)[
  #text(size: 9pt, fill: gray)[#data.org]
  #v(2pt)
  #text(size: 20pt, weight: "bold")[교육 이수 통지서]
  #v(-4pt)
  #text(size: 9pt, fill: gray)[문서번호 #data.refNo]
]

#v(10pt)
#line(length: 100%, stroke: 0.5pt + gray)
#v(8pt)

#text(weight: "bold")[수신자]
#grid(
  columns: (5em, 1fr),
  row-gutter: 4pt,
  [성명], [#data.recipient.name],
  [사번], [#data.recipient.employeeId],
  [부서], [#data.recipient.department],
)

#v(8pt)
#text(weight: "bold")[과정 정보]
#grid(
  columns: (5em, 1fr),
  row-gutter: 4pt,
  [과정명], [#data.course.title],
  [기간], [#data.course.period],
  [이수시간], [#data.course.totalHours 시간],
)

#v(8pt)
#text(weight: "bold")[세션]
#table(
  columns: (auto, 1fr, auto),
  align: (left, left, right),
  inset: 6pt,
  [*일자*], [*주제*], [*시간*],
  ..data.sessions.map(s => ([#s.date], [#s.topic], [#s.hours])).flatten(),
)

#v(10pt)
#let passed = data.result.passed
#block(
  fill: if passed { rgb("#e6f4ea") } else { rgb("#fce8e6") },
  inset: 10pt,
  radius: 4pt,
  width: 100%,
)[
  #text(weight: "bold")[결과:]
  #if passed [ 이수 완료 ] else [ 미이수 ]
  #h(1fr)
  점수: #data.result.score / 100
]

#v(1fr)
#align(right)[
  발행일: #data.issuedAt \
  #text(weight: "bold")[#data.issuer.name], #data.issuer.title \
  #data.org
]
