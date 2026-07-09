const fs = require('fs');

const single = [
  ['查询所有用户的姓名和邮箱','SELECT name, email FROM users','SELECT name, email FROM users',true],
  ['统计用户总数','SELECT COUNT(*) FROM users','SELECT COUNT(*) FROM users',true],
  ['查找年龄大于25岁的用户','SELECT * FROM users WHERE age > 25','SELECT * FROM users WHERE age > 25',true],
  ['按注册时间降序排列','SELECT * FROM users ORDER BY created_at DESC','SELECT * FROM users ORDER BY created_at DESC',true],
  ['统计每个城市的用户数量','SELECT city, COUNT(*) FROM users GROUP BY city','SELECT city, COUNT(*) FROM users GROUP BY city',true],
  ['查找名为张三的用户',"SELECT * FROM users WHERE name = 'Zhang San'","SELECT * FROM users WHERE name = 'Zhang San'",true],
  ['查询最近7天注册的用户',"SELECT * FROM users WHERE created_at >= DATE('now', '-7 days')","SELECT * FROM users WHERE created_at >= date('now', '-7 days')",true],
  ['更新用户邮箱',"UPDATE users SET email = 'new@email.com' WHERE id = 1","UPDATE users SET email = 'new@email.com' WHERE id = 1",true],
  ['删除已注销的用户','DELETE FROM users WHERE status = 0','DELETE FROM users WHERE status = 0',true],
  ['查询VIP用户的订单','SELECT u.name, o.* FROM users u JOIN orders o ON u.id = o.user_id WHERE u.vip = 1','SELECT u.name, o.* FROM users u JOIN orders o ON u.id = o.user_id WHERE u.vip = 1',false],
  ['查找没有订单的用户','SELECT * FROM users WHERE id NOT IN (SELECT user_id FROM orders)','SELECT * FROM users WHERE id NOT IN (SELECT user_id FROM orders)',true],
  ['计算用户平均年龄','SELECT AVG(age) FROM users','SELECT AVG(age) FROM users',true],
];

const multi = [
  ['查询用户及其订单信息','SELECT u.name, o.product FROM users u JOIN orders o ON u.id = o.user_id','SELECT u.name, o.product FROM users u JOIN orders o ON u.id = o.user_id',true],
  ['查询每个用户的订单总数','SELECT u.name, COUNT(o.id) FROM users u LEFT JOIN orders o ON u.id = o.user_id GROUP BY u.id','SELECT u.name, COUNT(o.id) FROM users u LEFT JOIN orders o ON u.id = o.user_id GROUP BY u.id',true],
  ['查找购买了特定商品的用户',"SELECT DISTINCT u.* FROM users u JOIN orders o ON u.id = o.user_id WHERE o.product = 'iPhone'","SELECT DISTINCT u.* FROM users u JOIN orders o ON u.id = o.user_id WHERE o.product = 'iPhone'",true],
  ['多表联结统计销售额','SELECT p.name, SUM(o.amount) FROM products p JOIN orders o ON p.id = o.product_id GROUP BY p.id','SELECT p.name, SUM(o.amount) FROM products p JOIN orders o ON p.id = o.product_id GROUP BY p.id',true],
  ['查找用户最近订单','SELECT u.name, o.* FROM users u JOIN orders o ON u.id = o.user_id WHERE o.created_at = (SELECT MAX(created_at) FROM orders WHERE user_id = u.id)','SELECT u.name, o.* FROM users u JOIN orders o ON u.id = o.user_id ORDER BY o.created_at DESC LIMIT 1',false],
  ['查询库存不足的商品','SELECT p.name, i.quantity FROM products p JOIN inventory i ON p.id = i.product_id WHERE i.quantity < 10','SELECT p.name, i.quantity FROM products p JOIN inventory i ON p.id = i.product_id WHERE i.quantity < 10',true],
  ['多表更新订单状态','UPDATE orders SET status = 1 WHERE id IN (SELECT o.id FROM orders o JOIN payments p ON o.id = p.order_id WHERE p.paid = 1)','UPDATE orders SET status = 1 WHERE id IN (SELECT o.id FROM orders o JOIN payments p ON o.id = p.order_id WHERE p.paid = 1)',true],
  ['查询用户购物车和愿望清单','SELECT u.name, c.product, w.product FROM users u LEFT JOIN cart c ON u.id = c.user_id LEFT JOIN wishlist w ON u.id = w.user_id','SELECT u.name, c.product FROM users u LEFT JOIN cart c ON u.id = c.user_id',false],
];

const complex = [
  ['递归查询组织架构','WITH RECURSIVE org AS (SELECT * FROM employees WHERE manager_id IS NULL UNION ALL SELECT e.* FROM employees e JOIN org o ON e.manager_id = o.id) SELECT * FROM org','WITH RECURSIVE org AS (SELECT * FROM employees WHERE manager_id IS NULL UNION ALL SELECT e.* FROM employees e JOIN org o ON e.manager_id = o.id) SELECT * FROM org',true],
  ['窗口函数计算排名','SELECT name, score, RANK() OVER (ORDER BY score DESC) FROM students','SELECT name, score, RANK() OVER (ORDER BY score DESC) FROM students',true],
  ['复杂子查询过滤','SELECT * FROM products WHERE id IN (SELECT product_id FROM orders GROUP BY product_id HAVING AVG(rating) > 4.0) AND price < 500','SELECT * FROM products WHERE price < 500 AND id IN (SELECT product_id FROM orders GROUP BY product_id HAVING AVG(rating) > 4.0)',true],
  ['多条件聚合查询',"SELECT region, category, SUM(sales) FROM orders WHERE date >= '2024-01-01' GROUP BY region, category HAVING SUM(sales) > 10000","SELECT region, category, SUM(sales) FROM orders WHERE date >= '2024-01-01' GROUP BY region, category HAVING SUM(sales) > 10000",true],
  ['CTE多步查询','WITH top_users AS (SELECT user_id, SUM(amount) as total FROM orders GROUP BY user_id ORDER BY total DESC LIMIT 10) SELECT u.* FROM users u JOIN top_users t ON u.id = t.user_id','WITH top_users AS (SELECT user_id, SUM(amount) as total FROM orders GROUP BY user_id ORDER BY total DESC LIMIT 10) SELECT u.* FROM users u JOIN top_users t ON u.id = t.user_id',true],
  ['时间序列聚合',"SELECT DATE(created_at), COUNT(*), SUM(amount) FROM orders WHERE created_at >= DATE('now', '-30 days') GROUP BY DATE(created_at)","SELECT DATE(created_at) as d, COUNT(*), SUM(amount) FROM orders WHERE created_at >= date('now', '-30 days') GROUP BY d",true],
  ['跨库查询','SELECT * FROM db1.users u JOIN db2.orders o ON u.id = o.user_id WHERE o.status = 1','SELECT * FROM users u JOIN orders o ON u.id = o.user_id WHERE o.status = 1',false],
  ['PIVOT行转列',"SELECT name, SUM(CASE WHEN month='Jan' THEN sales END) as Jan, SUM(CASE WHEN month='Feb' THEN sales END) as Feb FROM sales GROUP BY name","SELECT name, SUM(CASE WHEN month='Jan' THEN sales END) as Jan, SUM(CASE WHEN month='Feb' THEN sales END) as Feb FROM sales GROUP BY name",true],
];

function mkResults(arr, noise) {
  return arr.map(([q,a,r,c]) => ({
    question: q, expected_answer: a, model_response: r,
    is_correct: noise ? (Math.random() > noise ? c : !c) : c,
    score: c ? 0.8 + Math.random() * 0.2 : Math.random() * 0.3,
    runtime_ms: 80 + Math.floor(Math.random() * 300),
    token_count: 15 + Math.floor(Math.random() * 60),
    reason: c ? '' : 'SQL syntax or logic error',
    difficulty: ['简单','中等','困难'][Math.floor(Math.random() * 3)],
    table_count: arr === single ? 1 : arr === multi ? 2 : Math.floor(Math.random() * 3) + 2,
  }));
}

const groups = [];
const models = [
  ['GPT-4o','gpt-4o',0],
  ['GPT-4-Turbo','gpt-4-turbo',0.15],
  ['Claude-Sonnet-5','claude-sonnet-5',0.08],
  ['Gemini-2.5-Pro','gemini-2.5-pro',0.2],
  ['DeepSeek-Chat','deepseek-chat',0.25],
];

models.forEach(([name,model,noise]) => {
  groups.push({
    group_name: name, model, eval_dataset: 'NL2SQL-Bench',
    variables: { temperature: 0.3, max_tokens: 4096 },
    results: {
      '单表查询': mkResults(single, noise),
      '多表查询': mkResults(multi, noise),
      '复杂查询': mkResults(complex, noise),
    },
  });
});

const out = __dirname + '/../sample_nl2sql.json';
fs.writeFileSync(out, JSON.stringify(groups, null, 2));
const total = groups.reduce((s,g) => s + Object.values(g.results).flat().length, 0);
console.log('Created sample_nl2sql.json: ' + groups.length + ' groups, ' + total + ' results');
