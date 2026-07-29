// PaperTrail 예제 템플릿 — 교육 이수 통지서 (Training Completion Notice)
//
// Papermake 는 렌더 시 요청 본문의 data 를 전역 `#data` 로 주입한다.
// 이 템플릿은 중첩 필드, 배열 반복(table), 조건 분기를 모두 사용해 데이터 바인딩을 보여준다.
//
// NOTE: 기본 Papermake 이미지에는 한글(CJK) 폰트가 없어 본문은 영문으로 작성했다.
// 한글 문서는 CJK 폰트를 컨테이너에 마운트한 뒤 사용하면 된다(README TODO 참고).

#set page(paper: "a4", margin: (x: 2.2cm, y: 2cm))
#set text(size: 10.5pt, font: "Libertinus Serif")

#align(center)[
  #text(size: 9pt, fill: gray)[#data.org]
  #v(2pt)
  #text(size: 20pt, weight: "bold")[Training Completion Notice]
  #v(-4pt)
  #text(size: 9pt, fill: gray)[Ref. No. #data.refNo]
]

#v(10pt)
#line(length: 100%, stroke: 0.5pt + gray)
#v(8pt)

#text(weight: "bold")[Recipient]
#grid(
  columns: (5em, 1fr),
  row-gutter: 4pt,
  [Name], [#data.recipient.name],
  [Emp. ID], [#data.recipient.employeeId],
  [Dept.], [#data.recipient.department],
)

#v(8pt)
#text(weight: "bold")[Course]
#grid(
  columns: (5em, 1fr),
  row-gutter: 4pt,
  [Title], [#data.course.title],
  [Period], [#data.course.period],
  [Hours], [#data.course.totalHours h],
)

#v(8pt)
#text(weight: "bold")[Sessions]
#table(
  columns: (auto, 1fr, auto),
  align: (left, left, right),
  inset: 6pt,
  [*Date*], [*Topic*], [*Hours*],
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
  #text(weight: "bold")[Result:]
  #if passed [ COMPLETED ] else [ NOT COMPLETED ]
  #h(1fr)
  Score: #data.result.score / 100
]

#v(1fr)
#align(right)[
  Issued: #data.issuedAt \
  #text(weight: "bold")[#data.issuer.name] — #data.issuer.title \
  #data.org
]
