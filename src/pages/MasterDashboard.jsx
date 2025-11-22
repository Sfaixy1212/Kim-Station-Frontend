import DashboardLayout from '../components/layout/DashboardLayout';
import MasterActivationsTable from '../components/master/MasterActivationsTable';

export default function MasterDashboard() {
  return (
    <DashboardLayout title="Dashboard Master">
      {/* Card Attivazioni a schermo pieno */}
      <div className="mt-4">
        <div className="rounded-2xl bg-white p-8 sm:p-6 shadow-sm h-[calc(100vh-150px)] overflow-hidden flex flex-col">
          <div className="mb-2">
            <h1 className="text-xl font-bold text-gray-900">Attivazioni</h1>
          </div>
          <div className="flex-1 min-h-0">
            {/* Contenuto scrollabile */}
            <div className="h-full overflow-auto pr-1">
              <MasterActivationsTable />
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
