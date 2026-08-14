import type { PPTElement } from '@/types/slides';
import type { FikaDocument } from '../types';
const agenticBridgeGoldenElementCoverage: Record<PPTElement['type'], true> = {
  text: true,
  image: true,
  shape: true,
  line: true,
  chart: true,
  table: true,
  latex: true,
  mermaid: true,
  code: true,
  video: true,
  audio: true
};
export const agenticBridgeGoldenElementTypes = Object.keys(agenticBridgeGoldenElementCoverage) as PPTElement['type'][];
export const agenticBridgeGoldenIds = {
  slide: 'slide_fixture_all_elements',
  section: 'section_fixture',
  note: 'note_fixture',
  noteReply: 'reply_fixture',
  animations: {
    textIn: 'animation_fixture_text_in',
    shapeAttention: 'animation_fixture_shape_attention',
    imageOut: 'animation_fixture_image_out'
  },
  elements: {
    text: 'text_fixture',
    image: 'image_fixture',
    shape: 'shape_fixture',
    line: 'line_fixture',
    chart: 'chart_fixture',
    table: 'table_fixture',
    latex: 'latex_fixture',
    mermaid: 'mermaid_fixture',
    code: 'code_fixture',
    video: 'video_fixture',
    audio: 'audio_fixture'
  }
} as const;
export const agenticBridgeGoldenDocument: FikaDocument = {
  title: 'Agentic bridge golden deck',
  theme: {
    backgroundColor: '#ffffff',
    themeColors: ['#5b9bd5', '#ed7d31', '#a5a5a5', '#ffc000', '#4472c4', '#70ad47'],
    fontColor: '#333333',
    fontName: '',
    outline: {
      width: 2,
      color: '#525252',
      style: 'solid'
    },
    shadow: {
      h: 3,
      v: 3,
      blur: 2,
      color: '#808080'
    }
  },
  slides: [{
    id: agenticBridgeGoldenIds.slide,
    background: {
      type: 'gradient',
      gradient: {
        type: 'linear',
        colors: [{
          pos: 0,
          color: '#ffffff'
        }, {
          pos: 100,
          color: '#e8f1ff'
        }],
        rotate: 45
      }
    },
    turningMode: 'fade',
    remark: '<p>Speaker notes fixture</p>',
    sectionTag: {
      id: agenticBridgeGoldenIds.section,
      title: 'Fixture Section'
    },
    notes: [{
      id: agenticBridgeGoldenIds.note,
      content: 'Comment fixture',
      time: 1,
      user: 'agent',
      elId: agenticBridgeGoldenIds.elements.text,
      replies: [{
        id: agenticBridgeGoldenIds.noteReply,
        content: 'Reply fixture',
        time: 2,
        user: 'agent'
      }]
    }],
    animations: [{
      id: agenticBridgeGoldenIds.animations.textIn,
      elId: agenticBridgeGoldenIds.elements.text,
      effect: 'fadeIn',
      type: 'in',
      duration: 1000,
      trigger: 'click'
    }, {
      id: agenticBridgeGoldenIds.animations.shapeAttention,
      elId: agenticBridgeGoldenIds.elements.shape,
      effect: 'pulse',
      type: 'attention',
      duration: 800,
      trigger: 'meantime'
    }, {
      id: agenticBridgeGoldenIds.animations.imageOut,
      elId: agenticBridgeGoldenIds.elements.image,
      effect: 'fadeOut',
      type: 'out',
      duration: 600,
      trigger: 'auto'
    }],
    elements: [{
      id: agenticBridgeGoldenIds.elements.text,
      type: 'text',
      name: 'Golden text',
      left: 40,
      top: 40,
      width: 420,
      height: 80,
      rotate: 0,
      content: '<p>Text fixture</p>',
      defaultFontName: '',
      defaultColor: '#111111',
      fill: '#ffffff',
      lineHeight: 1.5,
      inset: [10, 10, 10, 10]
    }, {
      id: agenticBridgeGoldenIds.elements.image,
      type: 'image',
      name: 'Golden image',
      left: 500,
      top: 40,
      width: 200,
      height: 120,
      rotate: 0,
      fixedRatio: true,
      src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      filters: {
        brightness: '100%'
      },
      clip: {
        range: [[0, 0], [100, 100]],
        shape: 'rect'
      }
    }, {
      id: agenticBridgeGoldenIds.elements.shape,
      type: 'shape',
      name: 'Golden shape',
      left: 40,
      top: 160,
      width: 200,
      height: 120,
      rotate: 0,
      viewBox: [100, 100],
      path: 'M 0 0 L 100 0 L 100 100 L 0 100 Z',
      fixedRatio: false,
      fill: '#4472c4',
      outline: {
        width: 1,
        color: '#333333',
        style: 'solid'
      },
      text: {
        content: '<p>Shape text</p>',
        defaultFontName: '',
        defaultColor: '#ffffff',
        align: 'middle'
      }
    }, {
      id: agenticBridgeGoldenIds.elements.line,
      type: 'line',
      name: 'Golden line',
      left: 280,
      top: 180,
      width: 220,
      start: [0, 0],
      end: [220, 80],
      style: 'solid',
      color: '#333333',
      points: ['', 'arrow']
    }, {
      id: agenticBridgeGoldenIds.elements.chart,
      type: 'chart',
      name: 'Golden chart',
      left: 520,
      top: 180,
      width: 260,
      height: 180,
      rotate: 0,
      chartType: 'bar',
      data: {
        labels: ['A', 'B'],
        legends: ['Series 1'],
        series: [[10, 20]]
      },
      options: {
        stack: false,
        lineSmooth: false
      },
      themeColors: ['#5b9bd5', '#ed7d31'],
      textColor: '#333333',
      lineColor: '#dddddd'
    }, {
      id: agenticBridgeGoldenIds.elements.table,
      type: 'table',
      name: 'Golden table',
      left: 40,
      top: 330,
      width: 360,
      height: 120,
      rotate: 0,
      outline: {
        width: 1,
        color: '#333333',
        style: 'solid'
      },
      colWidths: [0.5, 0.5],
      cellMinHeight: 36,
      data: [[{
        id: 'cell_1',
        colspan: 1,
        rowspan: 1,
        text: 'A1',
        style: {
          bold: true
        }
      }, {
        id: 'cell_2',
        colspan: 1,
        rowspan: 1,
        text: 'B1'
      }], [{
        id: 'cell_3',
        colspan: 1,
        rowspan: 1,
        text: 'A2'
      }, {
        id: 'cell_4',
        colspan: 1,
        rowspan: 1,
        text: 'B2'
      }]]
    }, {
      id: agenticBridgeGoldenIds.elements.latex,
      type: 'latex',
      name: 'Golden LaTeX',
      left: 430,
      top: 390,
      width: 150,
      height: 60,
      rotate: 0,
      latex: 'E=mc^2',
      path: 'M 0 0 L 100 0',
      color: '#111111',
      strokeWidth: 2,
      viewBox: [100, 40],
      fixedRatio: true
    }, {
      id: agenticBridgeGoldenIds.elements.mermaid,
      type: 'mermaid',
      name: 'Golden Mermaid',
      left: 40,
      top: 480,
      width: 280,
      height: 120,
      rotate: 0,
      code: 'graph TD;A-->B'
    }, {
      id: agenticBridgeGoldenIds.elements.code,
      type: 'code',
      name: 'Golden code',
      left: 340,
      top: 480,
      width: 260,
      height: 120,
      rotate: 0,
      code: 'const n = 1',
      language: 'typescript',
      theme: 'github-dark',
      fontSize: 18,
      showLineNumbers: true
    }, {
      id: agenticBridgeGoldenIds.elements.video,
      type: 'video',
      name: 'Golden video',
      left: 610,
      top: 390,
      width: 160,
      height: 90,
      rotate: 0,
      src: 'https://example.test/video.mp4',
      autoplay: false,
      poster: './imgs/template_2.webp',
      ext: 'mp4'
    }, {
      id: agenticBridgeGoldenIds.elements.audio,
      type: 'audio',
      name: 'Golden audio',
      left: 790,
      top: 390,
      width: 48,
      height: 48,
      rotate: 0,
      fixedRatio: true,
      color: '#4472c4',
      loop: false,
      autoplay: false,
      src: 'https://example.test/audio.mp3',
      ext: 'mp3'
    }]
  }]
};
export const agenticBridgeGoldenDocuments: FikaDocument[] = [agenticBridgeGoldenDocument];
export const agenticBridgeFixture = agenticBridgeGoldenDocument;
