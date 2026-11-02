import { prepareSvg, saveBlob, screenshotName } from './screenshot';

describe('the screenshot file name', () => {
  it('is the profile id, the card id or build, and the time or full run', () => {
    expect(screenshotName('V-test', 'c2', 200)).toBe('V-test-c2-t+3-20.png');
    expect(screenshotName('V-test', null, null)).toBe('V-test-build-full-run.png');
    expect(screenshotName('V 01/a', 'c1', 8.4)).toBe('V_01_a-c1-t+0-08.png');
  });
});

describe('the svg preparation', () => {
  it('adds xmlns when missing and sets the render size on the root only', () => {
    const out = prepareSvg(
      '<svg viewBox="0 0 10 10" width="5" height="5"><rect width="3"/></svg>',
      800,
      450,
    );
    expect(out).toBe(
      '<svg width="800" height="450" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="3"/></svg>',
    );
  });

  it('keeps an xmlns already there', () => {
    const out = prepareSvg('<svg xmlns="http://www.w3.org/2000/svg" class="board"></svg>', 4, 3);
    expect(out.match(/xmlns=/g)).toHaveLength(1);
    expect(out.startsWith('<svg width="4" height="3" xmlns=')).toBe(true);
  });
});

describe('the download', () => {
  it('clicks an <a download> with an object URL', () => {
    const create = vi.fn(() => 'blob:x');
    const orig = URL.createObjectURL;
    URL.createObjectURL = create;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe('V-test-build-full-run.png');
      expect(this.href).toBe('blob:x');
    });
    saveBlob(new Blob(['x'], { type: 'image/png' }), 'V-test-build-full-run.png');
    expect(create).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
    URL.createObjectURL = orig;
  });
});
