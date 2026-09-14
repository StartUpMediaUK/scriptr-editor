// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { fireEvent, render, screen } from '@testing-library/react';
import { Link2 } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import { Button, buttonVariants } from './button.js';

describe('Button', () => {
  it('provides the expanded package variants and pointer semantics', () => {
    expect(buttonVariants({ variant: 'muted-link', size: 'inline' })).toContain(
      'scriptr-ui-button',
    );
    expect(
      buttonVariants({ variant: 'ghost-no-hover', size: 'icon-xs' }),
    ).toContain('scriptr-ui-button');
  });

  it('keeps icon buttons accessible and prevents disabled activation', () => {
    const onClick = vi.fn();
    render(
      <Button
        aria-label="Add link"
        disabled
        onClick={onClick}
        size="icon-sm"
        variant="ghost"
      >
        <Link2 />
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Add link' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
