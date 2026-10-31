import '../../ui/test-utils';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { testVignette } from '../../engine/testVignette';
import { useDocument } from '../../state/document';
import { UI_DEFAULTS, useUi } from '../../state/ui';
import { bindKeys } from '../../commands/keys';
import { isMac } from '../../commands/registry';
import '../../commands/commands';
import { requestNameFocus, useLibraryRequests } from '../library/newProfile';
import TopBar from './TopBar';
import { hideToast, useToast } from './toastStore';

// Review 9.1 F-02: the name-field request is taken once, so undo does not pull focus back.
describe('TopBar name focus', () => {
  let unbind: () => void;
  beforeEach(() => {
    useUi.setState(UI_DEFAULTS);
    useDocument.getState().open(testVignette({ name: 'Alpha' }));
    hideToast();
    unbind = bindKeys();
  });
  afterEach(() => unbind());

  it('rename, Escape, Cmd+Z leaves focus on the body and toasts the undo', () => {
    render(
      <MemoryRouter initialEntries={['/build']}>
        <TopBar />
      </MemoryRouter>,
    );
    const name = screen.getByLabelText('Profile name');
    act(() => requestNameFocus());
    expect(document.activeElement).toBe(name);
    expect(useLibraryRequests.getState().nameFocus).toBe(0);

    fireEvent.change(name, { target: { value: 'Bravo' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(useDocument.getState().doc!.name).toBe('Bravo');
    expect(document.activeElement).toBe(document.body);

    fireEvent.keyDown(document.body, { key: 'Escape' });
    act(() => {
      fireEvent.keyDown(document.body, { key: 'z', metaKey: isMac(), ctrlKey: !isMac() });
    });
    expect(useDocument.getState().doc!.name).toBe('Alpha');
    expect(document.activeElement).toBe(document.body);
    expect(useToast.getState()).toMatchObject({ text: 'Undid: Rename profile.', visible: true });
  });
});
