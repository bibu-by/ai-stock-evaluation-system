// 回测领域模型（Task 11：5-3 回测接口预留）
//
// 第一版不做完整回测引擎，只做"数据管道"：
// 定义领域模型 + 提供 OHLCV CSV 导出，供 backtrader / qlib 等外部框架消费。
// 真正的回测执行器（BacktestEngine）将在后续任务实现。

// 回测策略定义
export interface BacktestStrategy {
  id: string;
  name: string;
  symbols: string[];          // 回测的股票代码列表
  startDate: string;          // ISO 日期
  endDate: string;            // ISO 日期
  initialCapital: number;     // 初始资金
  params: {
    commissionRate?: number;  // 佣金费率
    slippage?: number;        // 滑点
    riskFreeRate?: number;    // 无风险利率（算 Sharpe 用）
  };
  createdAt: string;
  updatedAt: string;
}

// 回测结果
export interface BacktestResult {
  strategyId: string;
  totalReturns: number;       // 总收益率 %
  annualReturns: number;      // 年化收益率 %
  maxDrawdown: number;        // 最大回撤 %
  sharpeRatio: number;        // 夏普比率
  winRate: number;            // 胜率 %
  totalTrades: number;        // 交易次数
  profitFactor: number;       // 盈亏比
  equityCurve: { date: string; equity: number }[];  // 权益曲线
  metrics: Record<string, number>;  // 其他指标
}

// CSV 导出格式（OHLCV，供 backtrader/qlib 消费）
export interface OhlcvRow {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
