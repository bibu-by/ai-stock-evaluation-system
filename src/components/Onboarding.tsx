// 首次启动引导组件
// 流程：风险声明 -> 选择 AI 厂商 -> 填 API Key -> 测试连接 -> 设置本金 -> 是否导入 Demo -> 进入主界面
// 仅在 config.firstRun === true 时显示。

import { useState } from "react";
import { useAppStore } from "@/store/appStore";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Database,
  Loader2,
  Wallet,
} from "lucide-react";
import {
  PROVIDER_PRESETS,
  PROVIDER_LABEL,
  type AiProvider,
  type AiModelConfig,
} from "@/domain/ai";
import { defaultAiGateway } from "@/services/aiGateway";
import { saveApiKey } from "@/services/localStore";
import { uid, nowIso } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Step =
  | "disclaimer"
  | "provider"
  | "apikey"
  | "test"
  | "capital"
  | "demo"
  | "done";

const STEPS: { key: Step; title: string }[] = [
  { key: "disclaimer", title: "风险声明" },
  { key: "provider", title: "选择 AI 厂商" },
  { key: "apikey", title: "配置 API Key" },
  { key: "test", title: "测试连接" },
  { key: "capital", title: "首次入金" },
  { key: "demo", title: "体验数据" },
];

export function Onboarding() {
  const { completeOnboarding, importDemoData, addModel } = useAppStore();
  const [step, setStep] = useState<Step>("disclaimer");
  const [agreed, setAgreed] = useState(false);

  // 模型表单
  const [provider, setProvider] = useState<AiProvider>("deepseek");
  const [modelName, setModelName] = useState("deepseek-chat");
  const [baseUrl, setBaseUrl] = useState("https://api.deepseek.com/v1");
  const [apiKey, setApiKey] = useState("");

  // 测试
  const [testing, setTesting] = useState(false);
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const [testMsg, setTestMsg] = useState("");

  // 本金
  const [capital, setCapital] = useState("100000");

  const preset = PROVIDER_PRESETS.find((p) => p.provider === provider);

  const onProviderChange = (p: AiProvider) => {
    const cfg = PROVIDER_PRESETS.find((x) => x.provider === p)!;
    setProvider(p);
    setBaseUrl(cfg.baseUrl);
    setModelName(cfg.defaultModel);
  };

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  const next = () => {
    const idx = STEPS.findIndex((s) => s.key === step);
    if (idx < STEPS.length - 1) {
      setStep(STEPS[idx + 1].key);
    }
  };

  const prev = () => {
    const idx = STEPS.findIndex((s) => s.key === step);
    if (idx > 0) {
      setStep(STEPS[idx - 1].key);
    }
  };

  // 测试连接并保存模型
  const runTest = async () => {
    if (!apiKey || !modelName) return;
    setTesting(true);
    setTestOk(null);
    setTestMsg("");
    try {
      const modelId = uid("model");
      const apiKeyRef = `ai-stock-agent:${modelId}`;

      // 先把 API Key 存入系统凭据（或开发环境 localStorage）
      await saveApiKey(apiKeyRef, apiKey);

      // 测试连接（使用临时带 apiKey 的模型对象）
      const testModel: AiModelConfig = {
        id: modelId,
        provider,
        providerLabel: PROVIDER_LABEL[provider],
        modelName,
        displayName: modelName,
        baseUrl,
        apiKey,
        apiKeyRef,
        isEnabled: true,
        isDefault: true,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      const res = await defaultAiGateway.testConnection(testModel);
      setTestOk(res.ok);
      setTestMsg(res.message);

      if (res.ok) {
        // 测试通过后保存模型（JSON 只存 apiKeyRef）
        await addModel({
          provider,
          providerLabel: PROVIDER_LABEL[provider],
          modelName,
          displayName: modelName,
          baseUrl,
          apiKeyRef,
          isEnabled: true,
          isDefault: true,
        });
      } else {
        // 测试失败删除凭据
        const { deleteApiKey } = await import("@/services/localStore");
        await deleteApiKey(apiKeyRef);
      }
    } catch (e) {
      setTestOk(false);
      setTestMsg((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  // 完成引导
  const finish = async (importDemo: boolean) => {
    if (importDemo) {
      await importDemoData();
    }
    await completeOnboarding(Number(capital) || 0);
    setStep("done");
  };

  if (step === "done") return null;

  return (
    <div className="flex h-full w-full items-center justify-center overflow-auto bg-background p-6">
      <div className="w-full max-w-2xl space-y-4">
        {/* 头部 */}
        <div className="text-center">
          <h1 className="text-2xl font-bold">AI 炒股评估系统</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Windows 桌面 GUI 应用 · 首次启动引导
          </p>
        </div>

        {/* 步骤指示器 */}
        <div className="flex items-center justify-center gap-1">
          {STEPS.map((s, i) => (
            <div
              key={s.key}
              className={cn(
                "flex items-center gap-1 text-[10px]",
                i <= stepIndex ? "text-primary" : "text-muted-foreground"
              )}
            >
              <div
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full border",
                  i < stepIndex
                    ? "border-primary bg-primary text-primary-foreground"
                    : i === stepIndex
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground"
                )}
              >
                {i < stepIndex ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <span className="hidden sm:inline">{s.title}</span>
              {i < STEPS.length - 1 && (
                <div className="mx-1 h-px w-4 bg-border sm:w-8" />
              )}
            </div>
          ))}
        </div>

        {/* 步骤内容 */}
        {step === "disclaimer" && (
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              <h2 className="text-sm font-semibold">风险免责声明</h2>
            </div>
            <div className="space-y-2 text-xs text-muted-foreground">
              <p>
                本系统是辅助分析与记录工具，<b className="text-foreground">不承诺收益</b>，
                <b className="text-foreground">不直接替用户自动交易</b>，
                所有买卖决策必须由用户本人确认。
              </p>
              <p>系统会调用你配置的 AI API 进行分析，API 调用产生的费用由你承担。</p>
              <p>所有数据默认保存在本机 AppData 目录，不上传到任何服务器。</p>
              <p>投资有风险，入市需谨慎。本系统的分析观点仅供参考，不构成投资建议。</p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={agreed} onCheckedChange={setAgreed} />
              我已阅读并理解上述风险声明
            </label>
            <div className="flex justify-end">
              <Button disabled={!agreed} onClick={() => next()}>
                下一步
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </Card>
        )}

        {step === "provider" && (
          <Card className="p-6 space-y-4">
            <h2 className="text-sm font-semibold">选择 AI 厂商</h2>
            <p className="text-xs text-muted-foreground">
              选择你要使用的 AI 服务商，后续可在模型设置中添加更多。
            </p>
            <div className="space-y-1">
              <Label>AI 厂商</Label>
              <Select
                value={provider}
                onChange={(e) => onProviderChange(e.target.value as AiProvider)}
              >
                {PROVIDER_PRESETS.map((p) => (
                  <option key={p.provider} value={p.provider}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>模型</Label>
              <Select
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
              >
                {preset?.models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Base URL</Label>
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.example.com/v1"
              />
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => prev()}>
                <ArrowLeft className="h-3.5 w-3.5" />
                上一步
              </Button>
              <Button disabled={!modelName || !baseUrl} onClick={() => next()}>
                下一步
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </Card>
        )}

        {step === "apikey" && (
          <Card className="p-6 space-y-4">
            <h2 className="text-sm font-semibold">配置 API Key</h2>
            <p className="text-xs text-muted-foreground">
              API Key 将保存在系统安全凭据中（Windows Credential Manager），
              不会明文写入普通 JSON 文件，也不会上传到任何服务器。
            </p>
            <div className="space-y-1">
              <Label>API Key</Label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
              />
            </div>
            <div className="rounded-md border border-border bg-secondary/30 p-3 text-[10px] text-muted-foreground">
              提示：你可以在对应厂商的控制台获取 API Key。
              如果暂时没有 Key，可以跳过本步，稍后在「模型设置」里再配置（但 Agent 功能将无法使用）。
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => prev()}>
                <ArrowLeft className="h-3.5 w-3.5" />
                上一步
              </Button>
              <Button variant="outline" onClick={() => next()}>
                跳过
              </Button>
              <Button disabled={!apiKey} onClick={() => next()}>
                下一步
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </Card>
        )}

        {step === "test" && (
          <Card className="p-6 space-y-4">
            <h2 className="text-sm font-semibold">测试连接</h2>
            <p className="text-xs text-muted-foreground">
              点击下方按钮测试 API Key 是否可用。测试通过后模型将被保存为默认模型。
            </p>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">当前配置</div>
              <div className="font-mono text-[10px] text-muted-foreground">
                {PROVIDER_LABEL[provider]} · {modelName} · {baseUrl}
              </div>
            </div>
            {testOk !== null && (
              <div
                className={cn(
                  "flex items-center gap-1 text-xs",
                  testOk ? "text-emerald-400" : "text-destructive"
                )}
              >
                {testOk ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                {testMsg}
              </div>
            )}
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => prev()}>
                <ArrowLeft className="h-3.5 w-3.5" />
                上一步
              </Button>
              <div className="flex gap-2">
                <Button
                  onClick={() => void runTest()}
                  disabled={testing || !apiKey}
                >
                  {testing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  测试连接
                </Button>
                <Button
                  variant="outline"
                  onClick={() => next()}
                  disabled={testOk === false}
                >
                  下一步
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </Card>
        )}

        {step === "capital" && (
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              <h2 className="text-sm font-semibold">首次入金</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              输入你的初始入金金额，这笔钱将同时成为累计投入本金和初始现金余额
            </p>
            <div className="space-y-1">
              <Label>入金金额（元）</Label>
              <Input
                type="number"
                value={capital}
                onChange={(e) => setCapital(e.target.value)}
                placeholder="如：100000"
              />
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => prev()}>
                <ArrowLeft className="h-3.5 w-3.5" />
                上一步
              </Button>
              <Button disabled={!capital} onClick={() => next()}>
                下一步
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </Card>
        )}

        {step === "demo" && (
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              <h2 className="text-sm font-semibold">是否导入 Demo 数据</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              正式版本默认不创建任何假数据。如果你想先体验界面，可以选择导入 Demo 数据
              （包含示例持仓、交易、Agent 任务、聊天记录）。
            </p>
            <div className="rounded-md border border-border bg-secondary/30 p-3 text-[10px] text-muted-foreground">
              <div className="font-medium text-foreground">Demo 模式</div>
              <div>· 允许使用 mock 行情</div>
              <div>· 包含示例持仓和交易记录</div>
              <div>· 可随时在设置页清空数据</div>
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => prev()}>
                <ArrowLeft className="h-3.5 w-3.5" />
                上一步
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => void finish(false)}>
                  直接开始（空白）
                </Button>
                <Button onClick={() => void finish(true)}>
                  导入 Demo 数据
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
