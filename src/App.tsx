import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { DataProvider } from './context/DataContext';
import AppLayout from './components/AppLayout';
import HomePage from './pages/HomePage';
import ExperimentListPage from './pages/ExperimentListPage';
import DashboardPage from './pages/DashboardPage';
import DetailPage from './pages/DetailPage';
import ComparePage from './pages/ComparePage';

const App: React.FC = () => {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 6,
        },
      }}
    >
      <DataProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/category/:categoryId" element={<ExperimentListPage />} />
              <Route path="/experiment/:experimentId" element={<DashboardPage />} />
              <Route
                path="/experiment/:experimentId/group/:groupId"
                element={<DetailPage />}
              />
              <Route
                path="/experiment/:experimentId/compare"
                element={<ComparePage />}
              />
            </Route>
          </Routes>
        </BrowserRouter>
      </DataProvider>
    </ConfigProvider>
  );
};

export default App;
