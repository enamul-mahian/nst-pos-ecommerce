import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import branchService from '../../services/branchService';
import bulkActionService from '../../services/bulkActionService';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { Building2 as NstHdrBuilding2 } from 'lucide-react';

export default function BranchList() {
  const [branches, setBranches] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);

  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const normalizeArrayResponse = (response) => {
    const payload = response?.data ?? response;

    const possibleArrays = [
      payload,
      payload?.data,
      payload?.branches,
      payload?.items,
      payload?.results,
      payload?.data?.data,
      payload?.data?.branches,
      payload?.data?.items,
      payload?.data?.results,
    ];

    const foundArray = possibleArrays.find((item) => Array.isArray(item));

    return foundArray || [];
  };

  const getErrorMessage = (err) => {
    return (
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      err?.message ||
      'Something went wrong. Please check API response.'
    );
  };

  const fetchBranches = async () => {
    try {
      setLoading(true);
      setError('');
      setMessage('');

      const response = await branchService.getBranches();

      console.log('Branch API Response:', response?.data);

      const data = normalizeArrayResponse(response);

      const activeBranches = data.filter((branch) => !branch?.deleted_at);

      setBranches(activeBranches);
      setSelectedIds([]);
    } catch (err) {
      console.error('Branch Fetch Error:', err);
      setBranches([]);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBranches();
  }, []);

  const filteredBranches = useMemo(() => {
    if (!search.trim()) {
      return branches;
    }

    const keyword = search.toLowerCase();

    return branches.filter((branch) => {
      const searchableText = [
        branch?.name,
        branch?.branch_name,
        branch?.code,
        branch?.branch_code,
        branch?.phone,
        branch?.address,
        branch?.manager?.name,
        branch?.manager?.email,
        branch?.manager_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(keyword);
    });
  }, [branches, search]);

  const filteredBranchIds = useMemo(() => {
    return filteredBranches.map((branch) => branch.id);
  }, [filteredBranches]);

  const isAllSelected = useMemo(() => {
    return (
      filteredBranchIds.length > 0 &&
      filteredBranchIds.every((id) => selectedIds.includes(id))
    );
  }, [filteredBranchIds, selectedIds]);

  const toggleSelectOne = (id) => {
    setSelectedIds((previous) => {
      if (previous.includes(id)) {
        return previous.filter((selectedId) => selectedId !== id);
      }

      return [...previous, id];
    });
  };

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds((previous) =>
        previous.filter((id) => !filteredBranchIds.includes(id))
      );

      return;
    }

    setSelectedIds((previous) => {
      const mergedIds = [...previous, ...filteredBranchIds];

      return [...new Set(mergedIds)];
    });
  };

  const handleSingleDelete = async (branch) => {
    const branchName =
      branch?.name || branch?.branch_name || `Branch #${branch?.id}`;

    const confirmed = window.confirm(
      `Are you sure you want to delete "${branchName}"?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(branch.id);
      setError('');
      setMessage('');

      await branchService.deleteBranch(branch.id);

      setMessage('Branch deleted successfully.');
      await fetchBranches();
    } catch (err) {
      console.error('Single Delete Error:', err);
      setError(getErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) {
      setError('Please select at least one branch first.');
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedIds.length} selected branch(es)?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setBulkDeleting(true);
      setError('');
      setMessage('');

      const response = await bulkActionService.delete('branches', selectedIds);

      const deletedCount =
        response?.data?.data?.deleted_count || selectedIds.length;

      setMessage(`${deletedCount} selected branch(es) deleted successfully.`);
      setSelectedIds([]);

      await fetchBranches();
    } catch (err) {
      console.error('Bulk Delete Error:', err);
      setError(getErrorMessage(err));
    } finally {
      setBulkDeleting(false);
    }
  };

  const getBranchName = (branch) => {
    return branch?.name || branch?.branch_name || '-';
  };

  const getBranchCode = (branch) => {
    return branch?.code || branch?.branch_code || '-';
  };

  const getManagerName = (branch) => {
    return (
      branch?.manager?.name ||
      branch?.manager_name ||
      branch?.manager?.email ||
      '-'
    );
  };

  const getStockItemsCount = (branch) => {
    return (
      branch?.stocks_count ??
      branch?.stock_items_count ??
      branch?.stock_items ??
      0
    );
  };

  const getTotalStockQty = (branch) => {
    return (
      branch?.total_stock_qty ??
      branch?.stock_qty ??
      branch?.stock_quantity ??
      branch?.total_quantity ??
      0
    );
  };

  return (
    <div className="p-4 md:p-6">
      <NstPageHeader icon={NstHdrBuilding2} title={<>Branches</>} subtitle={<>Manage all New Singapur Telecom branches.
          </>} actions={<><Link
          to="/branches/create"
          className="inline-flex items-center justify-center bg-[var(--nst-dashboard-primary)] hover:bg-[var(--nst-dashboard-primary)] text-white px-5 py-2.5 rounded-lg font-semibold"
        >
          + Add Branch
        </Link></>}/>

      {message && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
          {message}
        </div>
      )}

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-5">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500">Active Branches</p>
            <h2 className="text-3xl font-bold text-[var(--nst-dashboard-text)]">
              {branches.length}
            </h2>
          </div>

          <div className="flex flex-col md:flex-row gap-3 w-full xl:w-auto">
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={selectedIds.length === 0 || bulkDeleting}
              className="bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg font-semibold"
            >
              {bulkDeleting
                ? 'Deleting...'
                : `Delete Selected (${selectedIds.length})`}
            </button>

            <button
              type="button"
              onClick={() => setSelectedIds([])}
              disabled={selectedIds.length === 0}
              className="bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed text-[var(--nst-dashboard-text)] px-5 py-2.5 rounded-lg font-semibold"
            >
              Clear Selection
            </button>

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search branch..."
              className="w-full md:w-80 border border-gray-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]"
            />
          </div>
        </div>

        <div className="mt-4 text-sm text-gray-500">
          Selected: <span className="font-bold text-[var(--nst-dashboard-text)]">{selectedIds.length}</span>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-500">
            Branch data loading...
          </div>
        ) : filteredBranches.length === 0 ? (
          <div className="p-10 text-center">
            <h2 className="text-lg font-bold text-gray-700">No Branch Found</h2>
            <p className="text-gray-500 mt-1">
              No branch matched your search.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm min-w-[1100px]">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-5 py-4 font-semibold text-gray-600 w-12">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 cursor-pointer"
                      />
                    </th>

                    <th className="text-left px-5 py-4 font-semibold text-gray-600">
                      ID
                    </th>

                    <th className="text-left px-5 py-4 font-semibold text-gray-600">
                      Branch Name
                    </th>

                    <th className="text-left px-5 py-4 font-semibold text-gray-600">
                      Code
                    </th>

                    <th className="text-left px-5 py-4 font-semibold text-gray-600">
                      Manager
                    </th>

                    <th className="text-left px-5 py-4 font-semibold text-gray-600">
                      Phone
                    </th>

                    <th className="text-left px-5 py-4 font-semibold text-gray-600">
                      Stock Items
                    </th>

                    <th className="text-left px-5 py-4 font-semibold text-gray-600">
                      Total Qty
                    </th>

                    <th className="text-left px-5 py-4 font-semibold text-gray-600">
                      Status
                    </th>

                    <th className="text-right px-5 py-4 font-semibold text-gray-600">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {filteredBranches.map((branch) => (
                    <tr
                      key={branch.id}
                      className={`hover:bg-gray-50 ${
                        selectedIds.includes(branch.id) ? 'bg-[var(--nst-dashboard-primary-soft)]' : ''
                      }`}
                    >
                      <td className="px-5 py-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(branch.id)}
                          onChange={() => toggleSelectOne(branch.id)}
                          className="w-4 h-4 cursor-pointer"
                        />
                      </td>

                      <td className="px-5 py-4 text-gray-600">
                        #{branch.id}
                      </td>

                      <td className="px-5 py-4">
                        <div>
                          <p className="font-semibold text-[var(--nst-dashboard-text)]">
                            {getBranchName(branch)}
                          </p>
                          <p className="text-xs text-gray-400">
                            {branch?.address || '-'}
                          </p>
                        </div>
                      </td>

                      <td className="px-5 py-4 text-gray-600">
                        {getBranchCode(branch)}
                      </td>

                      <td className="px-5 py-4 text-gray-600">
                        {getManagerName(branch)}
                      </td>

                      <td className="px-5 py-4 text-gray-600">
                        {branch?.phone || '-'}
                      </td>

                      <td className="px-5 py-4 text-gray-600">
                        {getStockItemsCount(branch)}
                      </td>

                      <td className="px-5 py-4 text-gray-600">
                        {getTotalStockQty(branch)}
                      </td>

                      <td className="px-5 py-4">
                        <span className="inline-flex px-3 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700">
                          {branch?.status || 'active'}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            to={`/branches/${branch.id}/stock`}
                            className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold"
                          >
                            Stock
                          </Link>

                          <Link
                            to={`/branches/${branch.id}/edit`}
                            className="px-3 py-1.5 rounded-lg bg-[var(--nst-dashboard-primary-soft)] text-[var(--nst-dashboard-primary)] hover:bg-[var(--nst-dashboard-primary-soft)] font-semibold"
                          >
                            Edit
                          </Link>

                          <button
                            type="button"
                            onClick={() => handleSingleDelete(branch)}
                            disabled={deletingId === branch.id}
                            className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-60 font-semibold"
                          >
                            {deletingId === branch.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-gray-100">
              {filteredBranches.map((branch) => (
                <div
                  key={branch.id}
                  className={`p-4 ${
                    selectedIds.includes(branch.id) ? 'bg-[var(--nst-dashboard-primary-soft)]' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(branch.id)}
                      onChange={() => toggleSelectOne(branch.id)}
                      className="w-5 h-5 cursor-pointer mt-1"
                    />

                    <div className="flex-1">
                      <h3 className="font-bold text-[var(--nst-dashboard-text)]">
                        {getBranchName(branch)}
                      </h3>

                      <p className="text-xs text-gray-400 mt-1">
                        ID: #{branch.id}
                      </p>

                      <p className="text-xs text-gray-400 mt-1">
                        Code: {getBranchCode(branch)}
                      </p>

                      <p className="text-xs text-gray-400 mt-1">
                        Manager: {getManagerName(branch)}
                      </p>

                      <p className="text-xs text-gray-400 mt-1">
                        Phone: {branch?.phone || '-'}
                      </p>

                      <p className="text-xs text-gray-400 mt-1">
                        Stock Items: {getStockItemsCount(branch)} | Qty: {getTotalStockQty(branch)}
                      </p>

                      <div className="flex flex-wrap gap-2 mt-4">
                        <Link
                          to={`/branches/${branch.id}/stock`}
                          className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 font-semibold"
                        >
                          Stock
                        </Link>

                        <Link
                          to={`/branches/${branch.id}/edit`}
                          className="px-3 py-1.5 rounded-lg bg-[var(--nst-dashboard-primary-soft)] text-[var(--nst-dashboard-primary)] font-semibold"
                        >
                          Edit
                        </Link>

                        <button
                          type="button"
                          onClick={() => handleSingleDelete(branch)}
                          disabled={deletingId === branch.id}
                          className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 disabled:opacity-60 font-semibold"
                        >
                          {deletingId === branch.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <div className="p-4 bg-gray-50">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="w-full bg-white border border-gray-100 text-[var(--nst-dashboard-text)] px-4 py-2.5 rounded-lg font-semibold"
                >
                  {isAllSelected ? 'Unselect All' : 'Select All'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}