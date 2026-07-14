import React, { useEffect, useState, useMemo } from 'react';
import {
  Card, Col, Row, Typography, Table, Statistic, Tag, Button, Empty, Space,
  Spin, Popconfirm, message, Modal, Input,
} from 'antd';
import {
  BarChartOutlined, TrophyOutlined, SearchOutlined, RobotOutlined,
  PlusOutlined, EditOutlined, DeleteOutlined, SettingOutlined, DownloadOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import { useData } from '../context/DataContext';
import { createGroup, updateGroup, deleteGroup, generateReport, updateExperiment } from '../api/endpoints';
import GroupFormModal from '../components/GroupFormModal';
import TrainingMetricsManager from '../components/TrainingMetricsManager';
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
  const [importTab, setImportTab] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (urlExpId) selectExperiment(urlExpId);
  }, [urlExpId, selectExperiment]);

  const experiment = experimentDetail;

  const groups = experiment?.groups || [];
  const isTraining = experiment?.type === 'training';
  const isEvaluation = experiment?.type === 'evaluation' || experiment?.type === 'agent_evaluation';

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
  const [showSubCols, setShowSubCols] = useState(false);
  const [editConclusion, setEditConclusion] = useState(false);
  const [conclusionText, setConclusionText] = useState('');
  const [savingConclusion, setSavingConclusion] = useState(false);

  const handleSaveConclusion = async () => {
    setSavingConclusion(true);
    try {
      await updateExperiment(experiment!.id, { conclusion: conclusionText } as any);
      (experiment as any).conclusion = conclusionText;
      message.success('已保存');
      setEditConclusion(false);
    } catch { message.error('保存失败'); }
    finally { setSavingConclusion(false); }
  };

  // 为筛选收集唯一值
  const nameFilters = useMemo(() => [...new Set(groups.map((g) => g.name))].map((v) => ({ text: v, value: v })), [groups]);
  const modelFilters = useMemo(() => [...new Set(groups.map((g) => g.model).filter(Boolean))].slice(0, 50).map((v) => ({ text: v, value: v })), [groups]);
  const datasetFilters = useMemo(() => [...new Set(groups.map((g) => g.eval_dataset).filter(Boolean))].map((v) => ({ text: v, value: v })), [groups]);

  // ====== 管理实验组 state（所有 hooks 必须在条件返回之前） ======
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkEditData, setBulkEditData] = useState<Record<string, Record<string, string>>>({});
  const [bulkEditOrder, setBulkEditOrder] = useState<string[]>([]);
  const [bulkEditDeleted, setBulkEditDeleted] = useState<Set<string>>(new Set());
  const [newRowCounter, setNewRowCounter] = useState(0);
  const [bulkParamKeys, setBulkParamKeys] = useState<string[]>([]);

  // ====== 条件返回（所有 hooks 必须在之前） ======
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

  // ====== 管理实验组 函数 ======
  const openBulkEdit = () => {
    const data: Record<string, Record<string, string>> = {};
    const allKeys = new Set(paramKeys);
    groups.forEach((g) => {
      data[g.id] = {
        name: g.name,
        model: g.model || '',
        eval_dataset: g.eval_dataset || '',
        ...Object.fromEntries(Object.entries(g.parameters || {}).map(([k, v]) => [k, String(v ?? '')])),
      };
    });
    setBulkEditData(data);
    setBulkEditOrder(groups.map((g) => g.id));
    setBulkEditDeleted(new Set());
    setNewRowCounter(0);
    setBulkParamKeys([...allKeys]);
    setBulkEditOpen(true);
  };

  const addBulkRow = () => {
    const newId = `__new_${newRowCounter}`;
    setBulkEditData((prev) => ({ ...prev, [newId]: { name: '', model: '', eval_dataset: '' } }));
    setBulkEditOrder((prev) => [...prev, newId]);
    setNewRowCounter((c) => c + 1);
  };

  const deleteBulkRow = (id: string) => {
    if (id.startsWith('__new_')) {
      setBulkEditOrder((prev) => prev.filter((i) => i !== id));
    } else {
      setBulkEditDeleted((prev) => new Set(prev).add(id));
    }
  };

  const setBulkCell = (id: string, key: string, value: string) => {
    setBulkEditData((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  };

  const addBulkParamCol = () => {
    setBulkParamKeys((prev) => [...prev, '']);
  };

  const updateBulkParamKey = (idx: number, newKey: string) => {
    setBulkParamKeys((prev) => prev.map((k, i) => i === idx ? newKey : k));
  };

  const deleteBulkParamCol = (idx: number) => {
    const oldKey = bulkParamKeys[idx];
    setBulkParamKeys((prev) => prev.filter((_, i) => i !== idx));
    // 删除所有行中该 key 的数据
    if (oldKey) {
      setBulkEditData((prev) => {
        const next = { ...prev };
        for (const id of Object.keys(next)) {
          const row = { ...next[id] };
          delete row[oldKey];
          next[id] = row;
        }
        return next;
      });
    }
  };

  const handleBulkEditSave = async () => {
    // 删除被标记的
    for (const id of bulkEditDeleted) {
      await deleteGroup(id);
    }
    // 更新已有组
    for (const g of groups) {
      if (bulkEditDeleted.has(g.id)) continue;
      const vals = bulkEditData[g.id];
      if (!vals) continue;
      const name = vals.name;
      const model = vals.model;
      const eval_dataset = vals.eval_dataset;
      const parameters: Record<string, string | number> = {};
      for (const pk of bulkParamKeys) {
        if (!pk.trim()) continue;
        const v = vals[pk];
        if (v === '' || v === undefined) continue;
        parameters[pk.trim()] = isNaN(Number(v)) ? v : Number(v);
      }
      await updateGroup(g.id, { name, model, eval_dataset, parameters });
    }
    // 创建新组
    for (const id of bulkEditOrder) {
      if (!id.startsWith('__new_')) continue;
      const vals = bulkEditData[id];
      if (!vals || !vals.name?.trim()) continue;
      const name = vals.name;
      const model = vals.model;
      const eval_dataset = vals.eval_dataset;
      const parameters: Record<string, string | number> = {};
      for (const pk of bulkParamKeys) {
        if (!pk.trim()) continue;
        const v = vals[pk];
        if (v === '' || v === undefined) continue;
        parameters[pk.trim()] = isNaN(Number(v)) ? v : Number(v);
      }
      await createGroup(experiment.id!, { name, model, eval_dataset, parameters });
    }
    message.success('已保存');
    setBulkEditOpen(false);
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
    // 总体统计始终显示
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
    {
      title: '平均耗时', key: 'latency', width: 100,
      sorter: (a, b) => {
        const avgA = a.results?.length ? a.results.reduce((s, x) => s + (x.runtime_ms || 0), 0) / a.results.length : 0;
        const avgB = b.results?.length ? b.results.reduce((s, x) => s + (x.runtime_ms || 0), 0) / b.results.length : 0;
        return avgA - avgB;
      },
      render: (_: unknown, r: GroupRow) => r.results && r.results.length > 0 ? `${(r.results.reduce((s, x) => s + (x.runtime_ms || 0), 0) / r.results.length).toFixed(0)}ms` : '-',
    },
    // 子分组统计列（默认折叠）
    ...(hasSubCategories && showSubCols ? subCatNames.map((name) => ({
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
        return <span style={{ fontWeight: 500 }}>{(sc.accuracy * 100).toFixed(1)}%</span>;
      },
    })) : []),
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

  const handleExport = () => {
    const exportData = groups.map((g) => {
      const rawResults = g.results || g.evaluation_results || [];
      const results = rawResults.map((r: any) => {
        const { id, group_id, test_case_id, category_tag, key, question, expected_answer, ...rest } = r;
        return { question: question || '', expected_answer: expected_answer || '', ...rest };
      });
      return {
        group_name: g.name,
        model: g.model || '',
        eval_dataset: g.eval_dataset || '',
        variables: g.parameters || {},
        results,
      };
    });
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${experiment.name || 'experiment'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    message.success('已导出');
  };

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
          <Button icon={<DownloadOutlined />} onClick={handleExport}>导出</Button>
          <Button onClick={() => setImportTab(true)}>一键导入</Button>
          <Button icon={<RobotOutlined />} onClick={handleGenerateReport} loading={reportLoading}>AI 报告</Button>
          <Button type="primary" onClick={openBulkEdit}>管理实验组</Button>
        </Space>
      </div>

      {/* 实验结论卡片 */}
      <Card
        title="📝 实验结论与备注"
        size="small"
        style={{ marginBottom: 16, borderRadius: 8 }}
        extra={
          !editConclusion ? (
            <Button size="small" icon={<EditOutlined />} onClick={() => { setConclusionText(experiment.conclusion || ''); setEditConclusion(true); }}>
              编辑
            </Button>
          ) : null
        }
      >
        {editConclusion ? (
          <div>
            <Input.TextArea
              rows={4}
              value={conclusionText}
              onChange={(e) => setConclusionText(e.target.value)}
              placeholder="记录实验结论、发现、备注..."
            />
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <Button type="primary" size="small" loading={savingConclusion} onClick={handleSaveConclusion}>保存</Button>
              <Button size="small" onClick={() => setEditConclusion(false)}>取消</Button>
            </div>
          </div>
        ) : (
          <div style={{ whiteSpace: 'pre-wrap', color: experiment.conclusion ? '#333' : '#ccc', minHeight: 40, fontSize: 13 }}>
            {experiment.conclusion || '点击右上角「编辑」添加实验结论...'}
          </div>
        )}
      </Card>

      {/* 概览卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={8}>
          <Card><Statistic title="实验组数" value={groups.length} /></Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card>
            <Statistic
              title={isTraining ? '最佳准确率' : '最高正确率'}
              value={isTraining ? ((bestGroup?.metrics?.accuracy ?? 0) * 100).toFixed(2) : ((bestGroup?.accuracy ?? 0) * 100).toFixed(1)}
              suffix="%"
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card><Statistic title="最佳组" value={bestGroup?.name || '-'} /></Card>
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
            {hasSubCategories && (
              <Button size="small" onClick={() => setShowSubCols(!showSubCols)}>
                {showSubCols ? '收起子分组' : '展开子分组'}
              </Button>
            )}
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

      {/* 管理实验组 Modal */}
      <Modal
        title="管理实验组"
        open={bulkEditOpen}
        onOk={handleBulkEditSave}
        onCancel={() => setBulkEditOpen(false)}
        width={Math.max(900, 260 + (Object.keys(bulkEditData[groups[0]?.id] || {}).length) * 150)}
        destroyOnClose
        okText="保存全部"
      >
        <Table
          dataSource={bulkEditOrder.map((id, idx) => {
            const g = groups.find((g) => g.id === id);
            return { key: id, _id: id, _idx: idx, _isNew: id.startsWith('__new_'), _deleted: bulkEditDeleted.has(id), _name: g?.name || '' };
          })}
          pagination={false}
          size="small"
          scroll={{ x: 'max-content' }}
          rowClassName={(r: any) => r._deleted ? 'ant-table-row-hidden' : ''}
          locale={{ emptyText: '暂无实验组，点击下方按钮添加' }}
          columns={[
            {
              title: '#', width: 40, align: 'center' as const,
              render: (_: unknown, __: unknown, idx: number) => idx + 1,
            },
            { title: '实验组名称', width: 150,
              render: (_: unknown, r: any) => (
                <Input size="small" value={bulkEditData[r._id]?.name ?? ''}
                  onChange={(e) => setBulkCell(r._id, 'name', e.target.value)}
                  status={r._deleted ? 'error' : undefined} disabled={r._deleted}
                  placeholder={r._isNew ? '新实验组名称' : ''} />
              ),
            },
            { title: '模型', width: 160,
              render: (_: unknown, r: any) => (
                <Input size="small" value={bulkEditData[r._id]?.model ?? ''}
                  onChange={(e) => setBulkCell(r._id, 'model', e.target.value)}
                  disabled={r._deleted} />
              ),
            },
            { title: '评测集', width: 140,
              render: (_: unknown, r: any) => (
                <Input size="small" value={bulkEditData[r._id]?.eval_dataset ?? ''}
                  onChange={(e) => setBulkCell(r._id, 'eval_dataset', e.target.value)}
                  disabled={r._deleted} />
              ),
            },
            ...bulkParamKeys.map((key, ki) => ({
              title: (
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Input
                    size="small"
                    value={key}
                    onChange={(e) => updateBulkParamKey(ki, e.target.value)}
                    placeholder="变量名"
                    style={{ width: 80, fontWeight: 500 }}
                  />
                  <Button type="text" size="small" danger icon={<DeleteOutlined />}
                    onClick={() => deleteBulkParamCol(ki)} />
                </div>
              ),
              key: `edit_key_${ki}`,
              width: 150,
              render: (_: unknown, r: any) => (
                <Input size="small" value={bulkEditData[r._id]?.[key] ?? bulkEditData[r._id]?.[key] ?? ''}
                  onChange={(e) => setBulkCell(r._id, key, e.target.value)}
                  disabled={r._deleted} placeholder={key ? '' : '...'} />
              ),
            })),
            {
              title: '操作', width: 60, align: 'center' as const, fixed: 'right' as const,
              render: (_: unknown, r: any) => (
                r._deleted ? (
                  <Button type="link" size="small" onClick={() => setBulkEditDeleted((prev) => { const next = new Set(prev); next.delete(r._id); return next; })}>恢复</Button>
                ) : (
                  <Button type="link" size="small" danger onClick={() => deleteBulkRow(r._id)}>删除</Button>
                )
              ),
            },
          ] as ColumnsType<any>}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <Button type="dashed" onClick={addBulkRow} icon={<PlusOutlined />} style={{ flex: 1 }}>
            添加实验组
          </Button>
          <Button type="dashed" onClick={addBulkParamCol} icon={<PlusOutlined />} style={{ flex: 1 }}>
            添加变量列
          </Button>
        </div>
      </Modal>

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

    </div>
  );
};

export default DashboardPage;
