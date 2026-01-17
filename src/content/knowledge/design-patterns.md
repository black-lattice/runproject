# 设计模式速查

## Creational
- Singleton: 全局唯一实例，注意并发与测试隔离。
- Factory Method: 延迟实例化，解耦创建逻辑。
- Builder: 复杂对象分步构建，强调可读性。

## Structural
- Adapter: 接口转换，兼容旧系统。
- Decorator: 动态增强功能，避免子类爆炸。
- Facade: 统一入口，屏蔽内部复杂性。

## Behavioral
- Strategy: 可替换算法策略。
- Observer: 事件订阅与通知。
- State: 用状态对象消除条件分支。

## 何时使用
- 需求变化频繁：Strategy / State
- 复杂对象创建：Builder / Factory
- 旧系统集成：Adapter / Facade
