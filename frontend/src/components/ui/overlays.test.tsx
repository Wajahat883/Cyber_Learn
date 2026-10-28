import { beforeAll, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { Modal } from './Modal';
import { Menu } from './Menu';

// jsdom has no <dialog> behaviour; emulate showModal/close and the async `close` event.
beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { __patched?: boolean };
  if (proto.__patched) return;
  proto.__patched = true;
  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  proto.close = function (this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    setTimeout(() => this.dispatchEvent(new Event('close')));
  };
});

const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));

function ControlledModal({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Modal
        open={open}
        title="Delete lesson"
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        footer={<button onClick={() => setOpen(false)}>Cancel</button>}
      >
        Body
      </Modal>
      <span data-testid="state">{open ? 'open' : 'closed'}</span>
    </>
  );
}

describe('Modal', () => {
  it('is labelled by its title', () => {
    render(<ControlledModal onClose={() => undefined} />);
    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog).toHaveAccessibleName('Delete lesson');
  });

  it('calls onClose exactly once when the X button is pressed', async () => {
    const onClose = vi.fn();
    render(<ControlledModal onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Close dialog', hidden: true }));
    await flush();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('state')).toHaveTextContent('closed');
  });

  it('calls onClose once for a native close (Escape)', async () => {
    const onClose = vi.fn();
    render(<ControlledModal onClose={onClose} />);
    act(() => (screen.getByRole('dialog', { hidden: true }) as HTMLDialogElement).close());
    await flush();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose back when the parent closes it', async () => {
    const onClose = vi.fn();
    render(<ControlledModal onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel', hidden: true }));
    await flush();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('state')).toHaveTextContent('closed');
  });
});

describe('Menu', () => {
  const setup = () => {
    const onRename = vi.fn();
    render(
      <MemoryRouter>
        <Menu
          label="Lesson actions"
          trigger="…"
          triggerClassName=""
          items={[
            { label: 'Rename', onSelect: onRename },
            { label: 'Archived', onSelect: () => undefined, disabled: true },
            { label: 'Duplicate', onSelect: () => undefined },
            { label: 'Open gallery', to: '/gallery' },
          ]}
        />
      </MemoryRouter>,
    );
    return { onRename, trigger: screen.getByRole('button', { name: 'Lesson actions' }) };
  };

  it('focuses the first item on open and moves with arrow keys, Home and End (skipping disabled items)', async () => {
    const user = userEvent.setup();
    const { trigger } = setup();
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Duplicate' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Open gallery' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'Open gallery' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toHaveFocus();
  });

  it('Escape closes the menu and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    const { trigger } = setup();
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('opens from the keyboard with ArrowUp on the last item, and selecting runs the action', async () => {
    const user = userEvent.setup();
    const { trigger, onRename } = setup();
    trigger.focus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'Open gallery' })).toHaveFocus();
    await user.keyboard('{Home}{Enter}');
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
