import DashboardLayout from '../../components/layout/DashboardLayout';
import MasterContractsTable from '../../components/master/MasterContractsTable';

export default function MasterContratti() {
  return (
    <DashboardLayout title="Contratti">
      <div className="mt-4">
        <div className="rounded-2xl bg-white p-8 sm:p-6 shadow-sm h-[calc(100vh-150px)] overflow-hidden flex flex-col">
          <div className="mb-2">
            <h1 className="text-xl font-bold text-gray-900">Contratti</h1>
          </div>
          <div className="flex-1 min-h-0">
            <div className="h-full overflow-auto pr-1">
              <MasterContractsTable />
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
