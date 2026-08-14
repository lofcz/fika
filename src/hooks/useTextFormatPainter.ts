import { useMainStore } from '@/store';
export default () => {
  const richTextAttrs = useMainStore(s => s.richTextAttrs);
  const textFormatPainter = useMainStore(s => s.textFormatPainter);
  const setTextFormatPainter = useMainStore(s => s.setTextFormatPainter);
  const toggleTextFormatPainter = (keep = false) => {
    if (textFormatPainter) setTextFormatPainter(null);else {
      setTextFormatPainter({
        keep,
        bold: richTextAttrs.bold,
        em: richTextAttrs.em,
        underline: richTextAttrs.underline,
        strikethrough: richTextAttrs.strikethrough,
        color: richTextAttrs.color,
        backcolor: richTextAttrs.backcolor,
        fontname: richTextAttrs.fontname,
        fontsize: richTextAttrs.fontsize,
        align: richTextAttrs.align
      });
    }
  };
  return {
    toggleTextFormatPainter
  };
};
