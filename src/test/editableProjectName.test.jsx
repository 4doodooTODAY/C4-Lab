import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const rpc = vi.fn()
vi.mock('../lib/supabase', () => ({ supabase: { rpc: (...a) => rpc(...a) } }))

import EditableProjectName from '../components/projects/EditableProjectName'

describe('EditableProjectName inline', () => {
  beforeEach(() => rpc.mockReset())

  it('renames on Enter without opening the card', async () => {
    rpc.mockResolvedValue({ data: 'Spring Launch', error: null })
    const onCard = vi.fn()
    const onRenamed = vi.fn()
    render(
      <div onClick={onCard}>
        <EditableProjectName variant="inline" projectId="p1" name="Old" onRenamed={onRenamed} />
      </div>
    )
    fireEvent.click(screen.getByLabelText('Rename Old'))
    const input = screen.getByLabelText('Project name')
    fireEvent.click(input)
    fireEvent.change(input, { target: { value: '  Spring Launch ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(onRenamed).toHaveBeenCalledWith('Spring Launch'))
    expect(rpc).toHaveBeenCalledWith('rename_project', { p_project_id: 'p1', p_name: 'Spring Launch' })
    expect(onCard).not.toHaveBeenCalled()
  })

  it('shows the server error and stays in edit mode', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'You are not on this project.' } })
    render(<EditableProjectName variant="inline" projectId="p1" name="Old" />)
    fireEvent.click(screen.getByLabelText('Rename Old'))
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'New' } })
    fireEvent.click(screen.getByTitle('Save name'))
    expect(await screen.findByText('You are not on this project.')).toBeTruthy()
    expect(screen.getByLabelText('Project name')).toBeTruthy()
  })

  it('Escape cancels and empty names are refused', () => {
    render(<EditableProjectName variant="inline" projectId="p1" name="Old" />)
    fireEvent.click(screen.getByLabelText('Rename Old'))
    const input = screen.getByLabelText('Project name')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('Name cannot be empty.')).toBeTruthy()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.getByText('Old')).toBeTruthy()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('renders plain text when editing is not allowed', () => {
    render(<EditableProjectName variant="inline" projectId="p1" name="Old" canEdit={false} />)
    expect(screen.queryByLabelText('Rename Old')).toBeNull()
  })
})
