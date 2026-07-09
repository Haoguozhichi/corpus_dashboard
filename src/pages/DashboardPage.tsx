import React, { useEffect, useState, useMemo } from 'react';
import {
  Card, Col, Row, Typography, Table, Statistic, Tag, Button, Empty, Space,
  Spin, Popconfirm, message, Tabs, Modal, Input,
} from 'antd';
import {
  BarChartOutlined, TrophyOutlined, SearchOutlined, RobotOutlined,
  PlusOutlined, EditOutlined, DeleteOutlined, SettingOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import { useData } from '../context/DataContext';
import { createGroup, updateGroup, deleteGroup, generateReport, updateExperiment } from '../api/endpoints';
import GroupFormModal from '../components/GroupFormModal';
import TrainingMetricsManager from '../components/TrainingMetricsManager';
import TestCaseTable from '../components/TestCaseTable';
import CsvUploader from '../components/CsvUploader';
import BulkImport from '../components/BulkImport';
import type { ExperimentGroup } from '../types';

const { Title, Paragraph } = Typography;

interface GroupRow extends ExperimentGroup {
  key: string;
}

const DashboardPage: React.FC = () => {
  const { experimentId: urlExpId } = useParams<{ experimentId: string }>();
  const { experimentDetail, experimentLoading, refreshExperiment, selectExperiment, selectGroup, setCompareGroups } = useData();
  const navigate = useNavigate();

  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ExperimentGroup | null>(null);
  const [metricsModalOpen, setMetricsModalOpen] = useState(false);
  const [testCasesTab, setTestCasesTab] = useState(false);
  const [importTab, setImportTab] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (urlExpId) selectExperiment(urlExpId);
  }, [urlExpId, selectExperiment]);

  const experiment = experimentDetail;

  const groups = experiment?.groups || [];
  const isTraining = experiment?.type === 'training';
  const isAgent = experiment?.type === 'agent_evaluation';
  const isEvaluation = experiment?.type === 'evaluation' || isAgent;

  // 收集所有实验组的自定义指标名（必须在条件返回之前）
  const customMetricNames = React.useMemo(() => {
    const names = new Set<string>();
    groups.forEach((g) => {
      const cm = g.metrics?.custom_metrics || {};
      Object.keys(cm).forEach((k) => names.add(k));
    });
    return Array.from(names);
  }, [groups]);

  // 所有 hooks 必须在条件返回之前调用
  const tableData: GroupRow[] = groups.map((g) => ({ ...g, key: g.id }));
  const filteredData = useMemo(() => {
    if (!search.trim()) return tableData;
    const q = search.toLowerCase();
    return tableData.filter(
      (r) => r.name.toLowerCase().includes(q) || r.model.toLowerCase().includes(q),
    );
  }, [tableData, search]);

  // 收集子分组名
  const subCatNames = React.useMemo(() => {
    const names = new Set<string>();
    groups.forEach((g) => (g.subCategories || []).forEach((s) => names.add(s.name)));
    return Array.from(names);
  }, [groups]);

  // 收集变量名
  const paramKeys = React.useMemo(() => {
    const keys = new Set<string>();
    groups.forEach((g) => Object.keys(g.parameters || {}).forEach((k) => keys.add(k)));
    return Array.from(keys);
  }, [groups]);

  // 实验报告（必须在条件返回之前）
  const [reportModal, setReportModal] = useState(false);
  const [reportText, setReportText] = useState('');
  const [reportLoading, setReportLoading] = useState(false);

  // 为筛选收集唯一值
  const nameFilters = useMemo(() => [...new Set(groups.map((g) => g.name))].map((v) => ({ text: v, value: v })), [groups]);
  const modelFilters = useMemo(() => [...new Set(groups.map((g) => g.model).filter(Boolean))].slice(0, 50).map((v) => ({ text: v, value: v })), [groups]);
  const datasetFilters = useMemo(() => [...new Set(groups.map((g) => g.eval_dataset).filter(Boolean))].map((v) => ({ text: v, value: v })), [groups]);

  // 只在首次加载时显示 spinner，刷新时保持已有内容
  if (!experimentDetail) return <Spin size="large" style={{ display: 'block', margin: '60px auto' }} />;
  if (!experiment) return <Empty description="未找到该实验" style={{ marginTop: 80 }} />;

  // 最优组
  const bestGroup = groups.reduce((best, g) => {
    const a = isTraining ? (g.metrics?.accuracy ?? 0) : (g.accuracy ?? 0);
    const b = isTraining ? (best.metrics?.accuracy ?? 0) : (best.accuracy ?? 0);
    return a > b ? g : best;
  }, groups[0]);

  const handleGenerateReport = async () => {
    // 已有报告直接展示
    if (experiment?.ai_report) {
      setReportText(experiment.ai_report);
      setReportModal(true);
      return;
    }
    // 生成新报告
    setReportLoading(true); setReportModal(true); setReportText('生成中...');
    try {
      const res = await generateReport({ experiment: { name: experiment?.name, type: experiment?.type, groups } });
      setReportText(res.result);
      await updateExperiment(experiment!.id, { ai_report: res.result } as any).catch(() => {});
      // 更新本地状态，下次点击直接展示
      if (experiment) (experiment as any).ai_report = res.result;
    } catch { setReportText('报告生成失败'); }
    finally { setReportLoading(false); }
  };

  // ====== Group CRUD ======
  const handleCreateGroup = () => { setEditingGroup(null); setGroupModalOpen(true); };
  const handleEditGroup = (g: ExperimentGroup) => { setEditingGroup(g); setGroupModalOpen(true); };

  const handleGroupOk = async (values: { name: string; model: string; parameters: Record<string, string | number> }) => {
    if (editingGroup) {
      await updateGroup(editingGroup.id, values);
      message.success('实验组已更新');
    } else {
      await createGroup(experiment.id!, values);
      message.success('实验组已创建');
    }
    setGroupModalOpen(false);
    refreshExperiment();
  };

  const handleDeleteGroup = async (id: string) => {
    await deleteGroup(id);
    message.success('实验组已删除');
    refreshExperiment();
  };

  const handleOpenMetrics = () => { setMetricsModalOpen(true); };
  const handleRowClick = (record: GroupRow) => {
    selectGroup(record.id);
    navigate(`/experiment/${experiment.id}/group/${record.id}`);
  };

  // ====== 表格列 ======
  const commonColumns: ColumnsType<GroupRow> = [
    { title: '实验组', dataIndex: 'name', key: 'name', fixed: 'left', width: 160, sorter: (a, b) => a.name.localeCompare(b.name), filters: nameFilters, onFilter: (v, r) => r.name === v, render: (n: string) => <strong>{n}</strong> },
    { title: '模型', dataIndex: 'model', key: 'model', width: 160, ellipsis: true, sorter: (a, b) => a.model.localeCompare(b.model), filters: modelFilters, onFilter: (v, r) => r.model === v, filterSearch: true },
    { title: '评测集', dataIndex: 'eval_dataset', key: 'eval_dataset', width: 120, ellipsis: true, sorter: (a, b) => (a.eval_dataset || '').localeCompare(b.eval_dataset || ''),
      filters: datasetFilters, onFilter: (v, r) => r.eval_dataset === v,
      render: (t: string) => t || <span style={{ color: '#ccc' }}>—</span> },
    // 变量列——每个变量名作为独立列
    ...paramKeys.map((key) => ({
      title: key,
      key: `param_${key}`,
      width: Math.max(80, key.length * 10 + 40),
      ellipsis: true,
      sorter: (a: GroupRow, b: GroupRow) => {
        const va = a.parameters?.[key]; const vb = b.parameters?.[key];
        if (va === undefined && vb === undefined) return 0;
        if (va === undefined) return -1; if (vb === undefined) return 1;
        if (typeof va === 'number' && typeof vb === 'number') return va - vb;
        return String(va).localeCompare(String(vb));
      },
      render: (_: unknown, r: GroupRow) => {
        const v = r.parameters?.[key];
        return v !== undefined ? String(v) : <span style={{ color: '#ccc' }}>—</span>;
      },
    })),
  ];

  const trainingColumns: ColumnsType<GroupRow> = [
    ...commonColumns,
    {
      title: '准确率', key: 'accuracy', width: 100,
      sorter: (a, b) => (a.metrics?.accuracy ?? 0) - (b.metrics?.accuracy ?? 0),
      render: (_: unknown, r: GroupRow) => {
        const v = r.metrics?.accuracy ?? 0;
        const best = bestGroup?.metrics?.accuracy ?? 0;
        return <span style={{ color: v === best ? '#52c41a' : undefined }}>{(v * 100).toFixed(2)}%{v === best && <TrophyOutlined style={{ color: '#faad14', marginLeft: 4 }} />}</span>;
      },
    },
    {
      title: 'F1', key: 'f1', width: 90,
      sorter: (a, b) => (a.metrics?.f1_score ?? 0) - (b.metrics?.f1_score ?? 0),
      render: (_: unknown, r: GroupRow) => ((r.metrics?.f1_score ?? 0) * 100).toFixed(2) + '%',
    },
    {
      title: '精确率', key: 'prec', width: 90,
      sorter: (a, b) => (a.metrics?.precision ?? 0) - (b.metrics?.precision ?? 0),
      render: (_: unknown, r: GroupRow) => ((r.metrics?.precision ?? 0) * 100).toFixed(2) + '%',
    },
    {
      title: '召回率', key: 'rec', width: 90,
      sorter: (a, b) => (a.metrics?.recall ?? 0) - (b.metrics?.recall ?? 0),
      render: (_: unknown, r: GroupRow) => ((r.metrics?.recall ?? 0) * 100).toFixed(2) + '%',
    },
    ...customMetricNames.map((name) => ({
      title: name,
      key: `custom_${name}`,
      width: 100,
      sorter: (a: GroupRow, b: GroupRow) => (a.metrics?.custom_metrics?.[name] ?? 0) - (b.metrics?.custom_metrics?.[name] ?? 0),
      render: (_: unknown, r: GroupRow) => {
        const v = r.metrics?.custom_metrics?.[name];
        return v !== undefined ? (v * 100).toFixed(2) + '%' : '-';
      },
    })),
    {
      title: '运行时间', key: 'runtime', width: 100,
      sorter: (a, b) => (a.metrics?.runtime ?? 0) - (b.metrics?.runtime ?? 0),
      render: (_: unknown, r: GroupRow) => {
        const s = r.metrics?.runtime ?? 0;
        return s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 60)}m`;
      },
    },
    {
      title: 'Token', key: 'token', width: 90,
      sorter: (a, b) => (a.metrics?.token_count ?? 0) - (b.metrics?.token_count ?? 0),
      render: (_: unknown, r: GroupRow) => (r.metrics?.token_count ?? 0) > 0 ? (r.metrics?.token_count ?? 0).toLocaleString() : 'N/A',
    },
  ];

  const hasSubCategories = subCatNames.length > 0;

  const evaluationColumns: ColumnsType<GroupRow> = [
    ...commonColumns,
    // 无子分组时显示总体统计
    ...(!hasSubCategories ? [
      {
        title: '准确率', key: 'accuracy', width: 100,
        sorter: (a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0),
        render: (_: unknown, r: GroupRow) => {
          const v = r.accuracy ?? 0;
          const best = bestGroup?.accuracy ?? 0;
          return <span style={{ color: v === best ? '#52c41a' : undefined }}>{(v * 100).toFixed(1)}%{v === best && <TrophyOutlined style={{ color: '#faad14', marginLeft: 4 }} />}</span>;
        },
      },
      {
        title: '正确/总数', key: 'cnt', width: 100,
        sorter: (a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0),
        render: (_: unknown, r: GroupRow) => `${r.correctCount ?? 0}/${r.resultCount ?? 0}`,
      },
    ] : [
      // 有子分组时：子分组准确率 + 正确数
      ...subCatNames.flatMap((name) => [
        {
          title: `${name}准确率`,
          key: `sub_${name}_acc`,
          width: 100,
          sorter: (a: GroupRow, b: GroupRow) => {
            const sa = (a.subCategories || []).find((s) => s.name === name);
            const sb = (b.subCategories || []).find((s) => s.name === name);
            return (sa?.accuracy ?? 0) - (sb?.accuracy ?? 0);
          },
          render: (_: unknown, r: GroupRow) => {
            const sc = (r.subCategories || []).find((s) => s.name === name);
            if (!sc) return <span style={{ color: '#ccc' }}>—</span>;
            return <span>{(sc.accuracy * 100).toFixed(1)}%</span>;
          },
        },
        {
          title: `${name}正确/总数`,
          key: `sub_${name}_cnt`,
          width: 100,
          sorter: (a: GroupRow, b: GroupRow) => {
            const sa = (a.subCategories || []).find((s) => s.name === name);
            const sb = (b.subCategories || []).find((s) => s.name === name);
            return (sa?.correct ?? 0) - (sb?.correct ?? 0);
          },
          render: (_: unknown, r: GroupRow) => {
            const sc = (r.subCategories || []).find((s) => s.name === name);
            if (!sc) return <span style={{ color: '#ccc' }}>—</span>;
            return <span>{sc.correct}/{sc.total}</span>;
          },
        },
      ]),
    ]),
    {
      title: hasSubCategories ? '总耗时' : '平均耗时', key: 'latency', width: 100,
      sorter: (a, b) => {
        const avgA = a.results?.length ? a.results.reduce((s, x) => s + (x.runtime_ms || 0), 0) / a.results.length : 0;
        const avgB = b.results?.length ? b.results.reduce((s, x) => s + (x.runtime_ms || 0), 0) / b.results.length : 0;
        return avgA - avgB;
      },
      render: (_: unknown, r: GroupRow) => r.results && r.results.length > 0 ? `${(r.results.reduce((s, x) => s + (x.runtime_ms || 0), 0) / r.results.length).toFixed(0)}ms` : '-',
    },
  ];

  const actionColumn: ColumnsType<GroupRow> = [
    {
      title: '操作', key: 'action', width: 120,
      render: (_: unknown, record: GroupRow) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); handleEditGroup(record); }} />
          <Popconfirm title="确认删除?" onConfirm={(e) => { e?.stopPropagation(); handleDeleteGroup(record.id); }} onCancel={(e) => e?.stopPropagation()}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const columns = [...(isTraining ? trainingColumns : evaluationColumns), ...actionColumn];

  const handleCompare = () => {
    if (selectedRowKeys.length >= 2) {
      const ids = selectedRowKeys as string[];
      setCompareGroups(ids);
      navigate(`/experiment/${experiment.id}/compare?groups=${ids.join(',')}`);
    }
  };

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Title level={3} style={{ marginBottom: 4 }}>
            {experiment.name}
            {experiment.owner && <Tag style={{ marginLeft: 8, fontWeight: 400, fontSize: 13 }}>{experiment.owner}</Tag>}
          </Title>
          <Paragraph type="secondary">{experiment.description}</Paragraph>
        </div>
        <Space wrap>
          {isTraining && <Button icon={<SettingOutlined />} onClick={handleOpenMetrics}>管理指标</Button>}
          {isEvaluation && <Button onClick={() => setTestCasesTab(true)}>管理测试用例</Button>}
          <Button onClick={() => setImportTab(true)}>一键导入</Button>
          <Button icon={<RobotOutlined />} onClick={handleGenerateReport} loading={reportLoading}>AI 报告</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateGroup}>创建实验组</Button>
        </Space>
      </div>

      {/* 概览卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card><Statistic title="实验组数" value={groups.length} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title={isTraining ? '最佳准确率' : '最高正确率'}
              value={isTraining ? ((bestGroup?.metrics?.accuracy ?? 0) * 100).toFixed(2) : ((bestGroup?.accuracy ?? 0) * 100).toFixed(1)}
              suffix="%"
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card><Statistic title="最佳组" value={bestGroup?.name || '-'} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="实验类型"
              value={experiment.type === 'training' ? '训练实验' : experiment.type === 'evaluation' ? '评测实验' : experiment.type === 'agent_evaluation' ? 'Agent评测' : '其他'}
            />
          </Card>
        </Col>
      </Row>

      {/* 对比表 */}
      <Card
        title="实验组对比表"
        extra={
          <Space>
            <Input
              placeholder="搜索实验组..."
              prefix={<SearchOutlined />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
              style={{ width: 180 }}
              size="small"
            />
            <Tag color="blue">已选 {selectedRowKeys.length} 组</Tag>
            <Button type="primary" icon={<BarChartOutlined />} disabled={selectedRowKeys.length < 2} onClick={handleCompare}>对比选中组</Button>
          </Space>
        }
        style={{ borderRadius: 8 }}
      >
        <Table
          rowSelection={rowSelection}
          columns={columns}
          dataSource={filteredData}
          scroll={{ x: 1100 + paramKeys.length * 100 }}
          pagination={false}
          size="middle"
          onRow={(record) => ({
            onClick: () => handleRowClick(record),
            style: { cursor: 'pointer' },
          })}
        />
      </Card>

      {/* Modals */}
      <GroupFormModal open={groupModalOpen} editing={editingGroup} onOk={handleGroupOk} onCancel={() => setGroupModalOpen(false)} />

      <Modal title="管理训练指标" open={metricsModalOpen} onCancel={() => setMetricsModalOpen(false)} footer={null} width={1000} destroyOnClose>
        <TrainingMetricsManager groups={groups} onRefresh={refreshExperiment} />
      </Modal>

      <Modal title="AI 实验报告" open={reportModal} onCancel={() => setReportModal(false)} footer={null} width={700}>
        <div style={{ whiteSpace: 'pre-wrap', maxHeight: 500, overflow: 'auto', background: '#fafafa', padding: 12, borderRadius: 4, fontSize: 13 }}>
          {reportText || '正在生成...'}
        </div>
      </Modal>

      <Modal title="一键导入实验数据" open={importTab} onCancel={() => setImportTab(false)} footer={null} width={800}>
        <BulkImport experimentId={experiment.id!} experimentType={experiment.type} onSuccess={refreshExperiment} />
      </Modal>

      <Modal title="管理测试用例" open={testCasesTab} onCancel={() => setTestCasesTab(false)} footer={null} width={900}>
        <Tabs items={[
          {
            key: 'manual', label: '逐条编辑',
            children: <TestCaseTable experimentId={experiment.id!} testCases={experiment.testCases || []} onRefresh={refreshExperiment} />,
          },
          {
            key: 'json', label: 'JSON 批量上传',
            children: <CsvUploader experimentId={experiment.id!} onSuccess={refreshExperiment} />,
          },
        ]} />
      </Modal>

    </div>
  );
};

export default DashboardPage;
