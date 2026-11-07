import { describe, expect, it } from '@rstest/core';
import { speakerNotesToText } from '../src/utils/speakerNotes';

describe('speaker-note export text', () => {
  it('keeps generated bare list items and nested lists in document order, exactly once', () => {
    expect(speakerNotesToText('<p><strong>Discussion:</strong></p><ul><li>First point</li><li><em>Examples:</em><ul><li>Nested one</li><li>Nested two</li></ul></li><li>Final point</li></ul>'))
      .toBe('Discussion:\n• First point\n• Examples:\n  • Nested one\n  • Nested two\n• Final point');
  });

  it('keeps editor paragraphs in list items without duplicating nested text', () => {
    expect(speakerNotesToText('<ol start="3"><li><p>First</p><p>Continuation</p><ul><li><p>Nested</p></li></ul></li><li value="7"><p>Next</p></li></ol>'))
      .toBe('3. First\nContinuation\n  • Nested\n7. Next');
  });

  it('keeps headings, divs, hard breaks, empty paragraphs, entities and inline spaces', () => {
    expect(speakerNotesToText('<h2>Heading</h2>\n<div>Příliš &amp; &lt;téma&gt;<br>Second line</div><p><br></p><p><strong>Bold</strong> <em>italic</em></p><p></p><p>End</p>'))
      .toBe('Heading\nPříliš & <téma>\nSecond line\n\nBold italic\n\nEnd');
  });

  it('keeps plain text, preformatted spacing and empty remarks', () => {
    expect(speakerNotesToText('First\r\nSecond\n\nLast')).toBe('First\nSecond\n\nLast');
    expect(speakerNotesToText('<pre>  A\n    B</pre>')).toBe('  A\n    B');
    expect(speakerNotesToText('')).toBe('');
    expect(speakerNotesToText('<p><br></p>')).toBe('');
    expect(speakerNotesToText('<ol reversed><li>A</li><li>B</li></ol>')).toBe('2. A\n1. B');
  });

  it('omits non-note content without executing HTML', () => {
    expect(speakerNotesToText('<p>Before</p><script>throw Error()</script><style>p{}</style><template>Hidden</template><p>After</p>'))
      .toBe('Before\nAfter');
    expect(speakerNotesToText('<!-- start --><p>One<!-- comment --> two\n  three</p>'))
      .toBe('One two three');
  });
});
