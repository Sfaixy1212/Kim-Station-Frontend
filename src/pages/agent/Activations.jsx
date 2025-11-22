import DashboardLayout from '../../components/layout/DashboardLayout';
import ActivationsKPI from '../../components/agent/ActivationsKPI';
import RecentActivations from '../../components/dealer/RecentActivations';
import RecentOrders from '../../components/dealer/RecentOrders';

export default function AgentActivations() {
  return (
    <DashboardLayout title="Attivazioni">
      <div className="space-y-6">
        {/* KPI Attivazioni Mese */}
        <div className="relative z-10 bg-gray-50 -mx-4 px-4 py-4 sm:mx-0 sm:px-0">
          <ActivationsKPI />
        </div>

        {/* Ultime Attivazioni */}
        <RecentActivations />

        {/* Ultimi Ordini */}
        <RecentOrders />
      </div>
    </DashboardLayout>
  );
}
