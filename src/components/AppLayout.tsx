import React, { useMemo, useState } from 'react';
import { Layout, Breadcrumb, Button } from 'antd';
import { HomeOutlined, ArrowLeftOutlined, SettingOutlined } from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useData } from '../context/DataContext';
import LlmSettingsModal from './LlmSettingsModal';

const { Header: AntHeader, Content } = Layout;

const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [llmSettingsOpen, setLlmSettingsOpen] = useState(false);
  const {
    selectedExperiment, selectedGroup,
    compareGroups, goHome,
    selectExperiment,
  } = useData();

  const pathname = location.pathname;
  const isHome = pathname === '/';
  const isExperiment = pathname.startsWith('/experiment/') && !pathname.includes('/group/') && !pathname.includes('/compare');
  const isDetail = pathname.includes('/group/');
  const isCompare = pathname.includes('/compare');

  const isDeeperThanExperiment = isDetail || isCompare;

  const breadcrumbItems = useMemo(() => {
    const items: { title: React.ReactNode; onClick?: () => void }[] = [
      {
        title: <span><HomeOutlined style={{ marginRight: 4 }} />首页</span>,
        onClick: () => { goHome(); navigate('/'); },
      },
    ];
    // 实验：只在比实验更深时才显示为可点击上级
    if (selectedExperiment && isDeeperThanExperiment) {
      items.push({
        title: selectedExperiment.name,
        onClick: () => { selectExperiment(selectedExperiment.id); navigate(`/experiment/${selectedExperiment.id}`); },
      });
    }
    return items;
  }, [selectedExperiment, isDeeperThanExperiment, goHome, navigate, selectExperiment]);

  // 面包屑最后一级（当前页面，不可点击，黑色加粗）
  const currentLabel = useMemo(() => {
    if (isCompare && compareGroups.length >= 2) return `对比 ${compareGroups.length} 组`;
    if (isDetail && selectedGroup) return selectedGroup.name;
    if (isExperiment && selectedExperiment) return selectedExperiment.name;
    if (isHome) return null;
    return null;
  }, [isCompare, isDetail, isExperiment, compareGroups, selectedGroup, selectedExperiment]);

  // 返回按钮
  const backBtn = useMemo(() => {
    if (isCompare && selectedExperiment) return { label: '返回仪表盘', path: `/experiment/${selectedExperiment.id}` };
    if (isDetail && selectedExperiment) return { label: '返回仪表盘', path: `/experiment/${selectedExperiment.id}` };
    if (isExperiment) return { label: '返回首页', path: '/' };
    return null;
  }, [isCompare, isDetail, isExperiment, selectedExperiment]);

  const allBreadcrumbItems = [
    ...breadcrumbItems.map((item) => ({
      title: item.onClick ? <a onClick={item.onClick}>{item.title}</a> : item.title,
    })),
    ...(currentLabel ? [{ title: <span style={{ color: '#1f1f1f', fontWeight: 600 }}>{currentLabel}</span> }] : []),
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      {/* 顶部导航 */}
      <AntHeader
        style={{
          background: 'linear-gradient(135deg, #1677ff 0%, #0958d9 100%)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 32px',
          height: 52,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          zIndex: 10,
        }}
      >
        <span
          onClick={() => { goHome(); navigate('/'); }}
          style={{ color: '#fff', fontSize: 18, fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
        >
          📊 实验数据平台
        </span>
        <Button
          type="text"
          size="small"
          icon={<SettingOutlined />}
          onClick={() => setLlmSettingsOpen(true)}
          style={{ color: 'rgba(255,255,255,0.75)' }}
        >
          LLM
        </Button>
      </AntHeader>

      {/* 面包屑 + 返回按钮 */}
      {!isHome && (
        <div
          style={{
            background: '#fff',
            borderBottom: '1px solid #f0f0f0',
            padding: '8px 32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
          }}
        >
          <Breadcrumb items={allBreadcrumbItems} />
          {backBtn && (
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate(backBtn.path)}
            >
              {backBtn.label}
            </Button>
          )}
        </div>
      )}

      {/* 内容区 */}
      <Content style={{ padding: isHome ? '32px 32px' : '24px 32px', flex: 1 }}>
        <Outlet />
      </Content>

      <LlmSettingsModal open={llmSettingsOpen} onCancel={() => setLlmSettingsOpen(false)} onSaved={() => setLlmSettingsOpen(false)} />
    </Layout>
  );
};

export default AppLayout;
