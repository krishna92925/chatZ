import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OtpInput } from './OtpInput'

afterEach(cleanup)

function Harness({ onComplete }: { onComplete?: (v: string) => void }) {
  const [v, setV] = useState('')
  return <OtpInput length={6} value={v} onChange={setV} onComplete={onComplete} />
}

describe('OtpInput', () => {
  it('moves focus as digits are typed and completes at the last digit', async () => {
    const done = vi.fn()
    render(<Harness onComplete={done} />)
    await userEvent.type(screen.getByLabelText('Digit 1'), '123456')
    expect(done).toHaveBeenCalledWith('123456')
    expect((screen.getByLabelText('Digit 6') as HTMLInputElement).value).toBe('6')
  })
  it('ignores letters', async () => {
    render(<Harness />)
    await userEvent.type(screen.getByLabelText('Digit 1'), 'ab1')
    expect((screen.getByLabelText('Digit 1') as HTMLInputElement).value).toBe('1')
    expect((screen.getByLabelText('Digit 2') as HTMLInputElement).value).toBe('')
  })
  it('fills every box when a whole code is pasted, ignoring spaces and dashes', () => {
    const done = vi.fn()
    render(<Harness onComplete={done} />)
    fireEvent.paste(screen.getByLabelText('Digit 1'), { clipboardData: { getData: () => '123 456' } })
    expect(done).toHaveBeenCalledWith('123456')
  })
  it('backspace clears the previous digit when the box is empty', async () => {
    render(<Harness />)
    await userEvent.type(screen.getByLabelText('Digit 1'), '12')
    await userEvent.keyboard('{Backspace}')
    expect((screen.getByLabelText('Digit 2') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Digit 1') as HTMLInputElement).value).toBe('1')
  })
})
