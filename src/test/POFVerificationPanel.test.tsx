import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
const { rpcMock, getOpenHouseDocSignedUrlMock, toastMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(), getOpenHouseDocSignedUrlMock: vi.fn(), toastMock: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...args: unknown[]) => rpcMock(...args) } }));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('@/hooks/useOpenHouseAssetControl', () => ({ getOpenHouseDocSignedUrl: (...args: unknown[]) => getOpenHouseDocSignedUrlMock(...args) }));
import { POFVerificationPanel } from '@/components/POFVerificationPanel';
import type { AdminOpenHousePofRow } from '@/services/openHouseContextService';
const baseRow = (overrides: Partial<AdminOpenHousePofRow> = {}): AdminOpenHousePofRow => ({
  id: 'r-1', requester_id: 'user-abc-12345', proof_of_funds_url: 'docs/pof.pdf', proof_amount: 250000,
  pof_verified_status: 'unreviewed', pof_rejection_reason: null, created_at: '2026-04-01T00:00:00Z',
  listing_id: 'l-1', rejection_reason: null, status: 'approved', updated_at: '2026-04-01T00:00:00.123456Z', ...overrides,
});
function withRows(rows: AdminOpenHousePofRow[] | (() => AdminOpenHousePofRow[])) {
  rpcMock.mockImplementation((name: string, args: Record<string, string>) => Promise.resolve({
    data: name === 'get_admin_open_house_pof_reviews' ? (typeof rows === 'function' ? rows() : rows)
      : [baseRow({ id: args.p_registration_id, pof_verified_status: args.p_decision as 'verified' | 'rejected', pof_rejection_reason: args.p_reason })], error: null,
  }));
}
beforeEach(() => {
  rpcMock.mockReset(); getOpenHouseDocSignedUrlMock.mockReset(); toastMock.success.mockReset(); toastMock.error.mockReset();
  getOpenHouseDocSignedUrlMock.mockResolvedValue('https://signed.example/pof.pdf'); vi.spyOn(window, 'open').mockImplementation(() => null);
});
describe('POFVerificationPanel', () => {
  it('renders successful empty state', async () => { withRows([]); render(<POFVerificationPanel />); await screen.findByText(/No\s+unreviewed/i); });
  it('opens proof with the existing signed document helper', async () => {
    withRows([baseRow()]); render(<POFVerificationPanel />); await screen.findByText(/Investor user-a/); fireEvent.click(screen.getByRole('button', { name: /View Doc/i }));
    await waitFor(() => expect(window.open).toHaveBeenCalledWith('https://signed.example/pof.pdf', '_blank', 'noopener,noreferrer')); expect(getOpenHouseDocSignedUrlMock).toHaveBeenCalledWith('docs/pof.pdf');
  });
  it.each([null, '#', '   '])('shows unavailable document for %s', async proof_of_funds_url => {
    withRows([baseRow({ proof_of_funds_url })]); render(<POFVerificationPanel />); await screen.findByText(/Document unavailable/); expect(screen.queryByRole('button', { name: 'View Doc' })).toBeNull();
  });
  it('verifies a real returned row and uses exact version', async () => {
    withRows([baseRow()]); render(<POFVerificationPanel />); fireEvent.click(await screen.findByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith(expect.stringMatching(/verified for/)));
    expect(rpcMock).toHaveBeenCalledWith('review_admin_open_house_pof', { p_registration_id: 'r-1', p_decision: 'verified', p_reason: null, p_expected_updated_at: baseRow().updated_at });
  });
  it.each([{ data: null, error: { message: 'denied' } }, { data: [], error: null }, { data: [{ id: 'r-1' }], error: null }])('does not confirm failed, absent or malformed mutation row', async response => {
    rpcMock.mockResolvedValueOnce({ data: [baseRow()], error: null }).mockResolvedValueOnce(response); render(<POFVerificationPanel />); fireEvent.click(await screen.findByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith(expect.stringMatching(/Failed to verify/))); expect(toastMock.success).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: 'Verify' })).toBeInTheDocument();
  });
  it('requires a reject reason and submits proof reason only', async () => {
    withRows([baseRow()]); render(<POFVerificationPanel />); fireEvent.click(await screen.findByRole('button', { name: 'Reject' })); const confirm = screen.getByRole('button', { name: 'Confirm Rejection' }); expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/Document expired/), { target: { value: 'Expired proof' } }); fireEvent.click(confirm);
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith(expect.stringMatching(/rejected for/))); expect(rpcMock).toHaveBeenCalledWith('review_admin_open_house_pof', expect.objectContaining({ p_decision: 'rejected', p_reason: 'Expired proof' }));
  });
  it('cancels rejection without mutation', async () => {
    withRows([baseRow()]); render(<POFVerificationPanel />); fireEvent.click(await screen.findByRole('button', { name: 'Reject' })); fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); expect(screen.queryByRole('dialog')).toBeNull(); expect(rpcMock).toHaveBeenCalledTimes(1);
  });
  it('scopes the dedicated read with the optional listing', async () => {
    withRows([]); render(<POFVerificationPanel dealId='listing-a' />); await screen.findByText(/No\s+unreviewed/i); expect(rpcMock).toHaveBeenCalledWith('get_admin_open_house_pof_reviews', { p_listing_id: 'listing-a' });
  });
  it('switches verified and rejected tabs and preserves proof reason', async () => {
    withRows([baseRow({ pof_verified_status: 'verified' }), baseRow({ id: 'r-2', pof_verified_status: 'rejected', pof_rejection_reason: 'Expired', rejection_reason: 'Admission reason' })]); render(<POFVerificationPanel />); await screen.findByText(/No\s+unreviewed/i);
    fireEvent.click(screen.getByRole('button', { name: /Verified/ })); expect(screen.getByText(/Investor user-a/)).toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: /Rejected/ })); expect(screen.getByText(/Expired/)).toBeInTheDocument(); expect(screen.queryByText(/Admission reason/)).toBeNull();
  });
  it('shows load errors distinctly and supports retry', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: new Error('denied') }).mockResolvedValueOnce({ data: [baseRow()], error: null }); render(<POFVerificationPanel />); await screen.findByRole('alert'); expect(screen.queryByText(/No\s+unreviewed/i)).toBeNull(); fireEvent.click(screen.getByRole('button', { name: 'Retry' })); await screen.findByText(/Investor user-a/);
  });
  it('clears rows on successful empty refresh', async () => {
    let rows = [baseRow()]; withRows(() => rows); render(<POFVerificationPanel />); await screen.findByText(/Investor user-a/); rows = []; fireEvent.click(screen.getByRole('button', { name: 'Refresh' })); await screen.findByText(/No\s+unreviewed/i); expect(screen.queryByText(/Investor user-a/)).toBeNull();
  });
  it('ignores late results from an earlier deal', async () => {
    let first: (value: unknown) => void = () => {}; let second: (value: unknown) => void = () => {};
    rpcMock.mockImplementationOnce(() => new Promise(resolve => { first = resolve; })).mockImplementationOnce(() => new Promise(resolve => { second = resolve; }));
    const view = render(<POFVerificationPanel dealId='a' />); view.rerender(<POFVerificationPanel dealId='b' />); second({ data: [baseRow({ requester_id: 'new-user' })], error: null }); await screen.findByText(/Investor new-u/);
    first({ data: [baseRow({ requester_id: 'old-user' })], error: null }); await waitFor(() => expect(screen.queryByText(/Investor old-u/)).toBeNull());
  });
  it('renders unknown amount/date without synthetic facts', async () => {
    withRows([baseRow({ pof_verified_status: 'verified', proof_amount: null, created_at: null, proof_of_funds_url: null })]); render(<POFVerificationPanel />); await screen.findByText(/No\s+unreviewed/i); fireEvent.click(screen.getByRole('button', { name: /Verified/ })); expect(screen.getByText('Amount unavailable')).toBeInTheDocument(); expect(screen.getByText('Registration date unavailable')).toBeInTheDocument();
  });
});
