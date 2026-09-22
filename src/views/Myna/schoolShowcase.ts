import type { FikaDocument } from '@/embed/types'
import type { PPTElement, PPTShapeElement, Slide } from '@/types/slides'

const copy = {
  cs: { title: 'OBZOR — škola otevřených možností', identity: '01 / Základ identity', system: '02 / Barvy a typografie', stationery: '03 / Každodenní komunikace', poster: '04 / Pozvánka do školy', cover: '05 / Whitepaper · obálka', report: '06 / Whitepaper · výzkum', school: 'ŠKOLA OTEVŘENÝCH MOŽNOSTÍ', learn: 'Svět začíná\notázkou.', intro: 'Místo pro zvídavost. Pro odvahu zkoušet.\nPro každého, kdo chce vidět za obzor.', brand: 'Jedna škola.\nTisíc možností.', brandNote: 'Vizuální identita / 2026', mark: 'Otevřená kniha. Nový horizont.', markNote: 'Značka vychází ze dvou rozevřených stránek.\nProstor mezi nimi patří novým nápadům.', type: 'Jasně. Lidsky.\nS vlastní hlavou.', typeNote: 'Výrazný hlas pro velké myšlenky.\nKlidný rytmus pro každodenní čtení.', colors: ['Inkoust', 'Papír', 'Terakota', 'Světlo'], card: 'Váš prostor\npro růst.', name: 'Mgr. Eliška Novotná', role: 'Ředitelka školy', letter: 'Milí rodiče,', letterBody: 'dobrá škola otevírá dveře i nové otázky.\nDává dětem prostor objevovat vlastní cestu\na učí je dívat se na svět s porozuměním.\n\nTěšíme se na vše, co společně objevíme.', sign: 'Za tým školy OBZOR', event: 'Den\notevřených\nmožností.', date: '24. října / 10–16 h', eventNote: 'Přijďte se ptát. Tvořit. Objevovat.\nDveře máme otevřené.', whiteTitle: 'Škola, která\notvírá\nbudoucnost.', whiteSub: 'Jak vytvořit prostředí,\nve kterém se daří zvídavosti.', edition: 'PERSPEKTIVY VZDĚLÁVÁNÍ / 01', research: 'Učení začíná\npocitem bezpečí.', researchBody: 'Když se děti nebojí udělat chybu, mohou\npřemýšlet nahlas. Klást vlastní otázky.\nHledat řešení, která ještě nikdo nezkusil.', metric: 'prostor pro samostatné objevování', chartTitle: 'TŘI PILÍŘE OTEVŘENÉ ŠKOLY', pillars: ['Důvěra', 'Zvídavost', 'Spolupráce'], quote: '„Neučíme pro příští test.\nUčíme pro příští svět.“', foot: 'Ukázková studie · ilustrativní data', label: 'OBZOR / IDENTITA V SOUVISLOSTECH', label2: 'OD ZNAČKY KE KAŽDODENNÍMU ŽIVOTU', label3: 'MYŠLENKY, KTERÉ STOJÍ ZA SDÍLENÍ', note: 'Značka · komunikace · vzdělávání / 2026' },
  en: { title: 'OBZOR — a school of possibilities', identity: '01 / Brand foundations', system: '02 / Color and typography', stationery: '03 / Everyday communication', poster: '04 / Open school invitation', cover: '05 / Whitepaper · cover', report: '06 / Whitepaper · research', school: 'A SCHOOL OF POSSIBILITIES', learn: 'A world begins\nwith a question.', intro: 'Room for curiosity. Courage to try.\nFor everyone looking beyond the horizon.', brand: 'One school.\nEndless possibility.', brandNote: 'Visual identity / 2026', mark: 'An open book. A new horizon.', markNote: 'Two open pages form our symbol.\nThe space between them belongs to new ideas.', type: 'Clear. Human.\nIndependent.', typeNote: 'A confident voice for big ideas.\nA quiet rhythm for everyday reading.', colors: ['Ink', 'Paper', 'Terracotta', 'Light'], card: 'Your room\nto grow.', name: 'Eliška Novotná', role: 'School principal', letter: 'Dear families,', letterBody: 'A good school opens doors and new questions.\nIt gives children space to find their own path\nand to see the world with understanding.\n\nWe look forward to what we will discover together.', sign: 'The OBZOR team', event: 'Open minds.\nOpen doors.\nOpen day.', date: '24 October / 10 am–4 pm', eventNote: 'Come to ask. Make. Discover.\nOur doors are open.', whiteTitle: 'A school\nthat opens\nthe future.', whiteSub: 'Creating an environment\nwhere curiosity can thrive.', edition: 'PERSPECTIVES ON EDUCATION / 01', research: 'Learning starts\nwith belonging.', researchBody: 'When children are unafraid of mistakes,\nthey can think out loud. Ask their own questions.\nExplore solutions nobody has tried before.', metric: 'room for independent discovery', chartTitle: 'THREE PILLARS OF AN OPEN SCHOOL', pillars: ['Trust', 'Curiosity', 'Collaboration'], quote: '“We teach for the next world.\nNot just the next test.”', foot: 'Sample study · illustrative data', label: 'OBZOR / AN IDENTITY IN CONTEXT', label2: 'FROM A SYMBOL TO EVERYDAY LIFE', label3: 'IDEAS WORTH SHARING', note: 'Identity · communication · education / 2026' },
}

/** Standalone playground artwork. The embed's blank-document factory stays unchanged. */
export function createSchoolShowcase(locale: string): FikaDocument {
  const c = copy[locale as keyof typeof copy] || copy.en
  const ink = '#203649', paper = '#F4F0E7', orange = '#DE6547', light = '#D9E4ED', white = '#FFFFFF'
  let serial = 0
  const id = () => `school-art-${++serial}`
  const pages: Slide[] = []
  let elements: PPTElement[] = []
  const rect = (x: number, y: number, w: number, h: number, fill: string, parentFrameId?: string): PPTShapeElement => {
    const el: PPTShapeElement = { id: id(), type: 'shape', left: x, top: y, width: w, height: h, rotate: 0, viewBox: [100, 100], path: 'M0 0H100V100H0Z', fill, fixedRatio: false, parentFrameId }
    elements.push(el); return el
  }
  const frame = (x: number, y: number, w: number, h: number, fill: string, name: string, parent?: string) => { const el = rect(x,y,w,h,fill,parent); el.frame = { clipContent: true }; el.name = name; return el.id }
  const path = (x: number, y: number, w: number, h: number, d: string, fill: string, parent?: string) => { const el = rect(x,y,w,h,fill,parent); el.path = d; return el }
  const text = (value: string, x: number, y: number, w: number, size: number, color = ink, font = 'Arial', bold = false, parent?: string) => {
    const escape = (s: string) => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    elements.push({ id: id(), type: 'text', left:x, top:y, width:w, height: value.split('\n').length * size * 1.22 + 8, rotate:0, fixedHeight:true, inset:[0,0,0,0], lineHeight:1.22, paragraphSpace:0, defaultFontName:font, defaultColor:color, parentFrameId:parent, content:value.split('\n').map(line => `<p style="font-family:${font};font-size:${size}px;color:${color};font-weight:${bold?700:400}">${escape(line)}</p>`).join('') })
  }
  const logo = (x: number, y: number, size: number, color = ink, parent?: string) => {
    const groupId = id()
    // Open pages, with a clear central fold; geometry stays editable vector artwork.
    for (const d of ['M0 8L46 30V94L0 72Z','M54 30L100 8V72L54 94Z']) { const el=path(x,y,size,size,d,color,parent); el.groupId=groupId }
  }
  const rule = (y: number, color = ink, x = 64, width = 872) => rect(x,y,width,1.5,color)
  const page = (name: string, x: number, y: number, fill: string, draw: () => void) => { elements=[]; draw(); pages.push({ id:`school-showcase-${pages.length+1}`, canvasName:name, canvasPosition:{x,y}, background:{type:'solid',color:fill}, elements }) }

  page(c.identity,0,80,paper,() => {
    text('OBZOR',64,58,550,25,ink,'Arial',true); text('01 / 2026',760,62,200,17); rule(114)
    logo(322,186,356)
    text('OBZOR',204,556,670,112,ink,'Arial',true)
    text(c.school,208,700,650,21,ink,'Arial',true)
    rule(824); text(c.mark,64,854,860,25,ink,'Georgia'); text(c.markNote,64,905,872,18)
  })
  page(c.poster,1140,390,ink,() => {
    logo(68,60,52,paper); text('OBZOR',144,66,530,34,paper,'Arial',true)
    text(c.learn,64,186,885,102,paper,'Georgia')
    // Two rising half-discs create a second expression of the open-book symbol.
    path(64,500,416,300,'M0 100V50A50 50 0 0 1 100 50V100Z',orange)
    path(500,500,436,300,'M0 100V50A50 50 0 0 1 100 50V100Z',light)
    text(c.intro,64,851,880,25,paper)
    text(c.date,64,946,700,17,paper)
  })
  page(c.cover,2280,-100,light,() => {
    const f=frame(150,62,700,876,white,c.cover)
    logo(204,106,44,ink,f); text('OBZOR',266,110,400,25,ink,'Arial',true,f)
    text(c.edition,204,220,580,13,ink,'Arial',true,f)
    text(c.whiteTitle,204,287,585,65,ink,'Georgia',false,f)
    text(c.whiteSub,204,560,585,22,ink,'Arial',false,f)
    path(410,680,440,440,'M0 100V50A50 50 0 0 1 100 50V100Z',orange,f)
    path(625,680,225,440,'M0 0H100V100H0Z',ink,f)
    text('2026',204,845,190,24,ink,'Arial',true,f)
  })
  page(c.system,-100,1270,white,() => {
    text(c.system.toUpperCase(),64,62,860,19,ink,'Arial',true); rule(114)
    text('Aa',64,152,410,180,ink,'Georgia'); text('Aa',536,169,400,158,ink,'Arial',true)
    text('Georgia / Regular',72,381,430,18); text('Arial / Bold + Regular',540,381,410,18)
    rule(446); text(c.type,64,485,840,67,ink,'Georgia')
    text(c.typeNote,64,688,850,23)
    ;[ink,paper,orange,light].forEach((color,i) => { rect(64+i*222,803,204,108,color); text(c.colors[i],64+i*222,926,204,17) })
  })
  page(c.stationery,1050,1580,paper,() => {
    text(c.stationery.toUpperCase(),64,52,880,18,ink,'Arial',true)
    const letter=frame(370,120,564,790,white,c.letter)
    logo(411,161,42,ink,letter); text('OBZOR',472,168,400,23,ink,'Arial',true,letter)
    text(c.letter,412,303,474,29,ink,'Georgia',false,letter)
    text(c.letterBody,412,372,470,17,ink,'Arial',false,letter)
    text(c.sign,412,599,470,18,ink,'Arial',true,letter)
    rect(412,818,480,1,light,letter); text('obzor.example / ahoj@obzor.example',412,840,475,14,ink,'Arial',false,letter)
    const card=frame(64,648,548,285,ink,c.card)
    logo(96,684,47,paper,card); text('OBZOR',160,692,390,25,paper,'Arial',true,card)
    text(c.name,96,777,480,25,paper,'Arial',true,card); text(c.role,96,820,460,17,paper,'Arial',false,card)
    text('ahoj@obzor.example',96,874,450,17,paper,'Arial',false,card)
    text(c.card,64,179,285,48,ink,'Georgia')
    path(64,405,210,160,'M0 100V50A50 50 0 0 1 100 50V100Z',orange)
  })
  page(c.report,2330,1090,white,() => {
    text('OBZOR / '+c.edition,64,57,880,15,ink,'Arial',true); rule(104)
    text(c.research,64,143,880,66,ink,'Georgia')
    text(c.researchBody,64,336,864,23)
    rect(64,467,872,187,paper); text('68 %',88,483,450,92,orange,'Georgia'); text(c.metric,528,522,376,24)
    text(c.chartTitle,64,704,872,16,ink,'Arial',true)
    ;[.92,.76,.84].forEach((v,i) => { text(c.pillars[i],64,752+i*45,245,19); rect(316,756+i*45,620,20,paper); rect(316,756+i*45,620*v,20,i===1?orange:ink) })
    rule(923); text(c.foot,64,947,760,14); text('02',875,944,80,18,ink,'Arial',true)
  })
  // Three independent sections form a staggered review board; comments live in the gutters.
  const positions = [{x:0,y:160},{x:1460,y:480},{x:2920,y:0},{x:80,y:1540},{x:1540,y:1900},{x:3010,y:1320}]
  pages.forEach((page,i) => { page.canvasPosition=positions[i] })
  const cs = locale === 'cs'
  pages[0].workspaceLabels = [
    {id:'school-section-identity',kind:'section',text:cs?'01 · Základy značky':'01 · Brand foundations',x:-120,y:-80,width:1320,height:2780,fontSize:32,pageIds:[pages[0].id,pages[3].id]},
    {id:'school-section-communication',kind:'section',text:cs?'02 · Značka v každodenním životě':'02 · The identity in everyday life',x:1340,y:240,width:1320,height:2780,fontSize:32,pageIds:[pages[1].id,pages[4].id]},
    {id:'school-section-editorial',kind:'section',text:cs?'03 · Myšlenky a souvislosti':'03 · Ideas and perspectives',x:2800,y:-240,width:1330,height:2780,fontSize:32,pageIds:[pages[2].id,pages[5].id]},
    {id:'school-comment-identity',kind:'comment',text:cs?'Otevřená kniha jako společný motiv. Dvě stránky, dvě perspektivy — jeden prostor pro zvídavost.':'An open book is our shared motif. Two pages, two perspectives — one space for curiosity.',x:-960,y:520,width:700,height:1000,fontSize:28,replies:[cs?'Vyzkoušejte přesun celé sekce za její záhlaví. Logo i typografie zůstanou spolu.':'Drag the section header: the logo and typography move together.']},
    {id:'school-comment-editorial',kind:'comment',text:cs?'Od identity k obsahu. Whitepaper používá stejnou typografii a geometrický jazyk jako školní komunikace.':'From identity to content. The whitepaper shares the typography and geometry of the school identity.',x:2960,y:2710,width:1040,height:650,fontSize:28,replies:[],resolved:false},
  ]
  return { title:c.title, viewport:{size:1000,ratio:1}, slides:pages }
}
