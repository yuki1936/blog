---
title: 零散题解
description: 记录一些没有单独成篇的数学题、算法题与 Rust 解法。内容比较杂，想到什么、看到什么就写什么。
published: 2026-08-04
draft: false
---

## 开关阵列

群里看到的一道数学题。

### 题目

下表为一个开关阵列，每个开关只有“开”和“关”两种状态。按其中一个开关一次，会使其自身和所有相邻开关改变状态。

例如，按 `(2, 2)` 会使 `(1, 2)`、`(2, 1)`、`(2, 2)`、`(2, 3)` 和 `(3, 2)` 改变状态。如果要求只改变 `(1, 1)` 的状态，至少需要按多少次开关？

```text
(1, 1)  (1, 2)  (1, 3)
(2, 1)  (2, 2)  (2, 3)
(3, 1)  (3, 2)  (3, 3)
```

### 思路

用一个 `u16` 的低 9 位表示整个开关阵列，每个 `MASKS` 元素表示按下对应开关后受到影响的位置。改变状态相当于异或，因此可以枚举全部 `2^9` 种按法，找出最终效果等于目标状态的组合，再通过 `count_ones` 取按键次数的最小值。

程序得到的最少次数为 `5`。

### Rust 实现

```rust
fn main() {
    const MASKS: [u16; 9] = [
        0b000001011,
        0b000010111,
        0b000100110,
        0b001011001,
        0b010111010,
        0b100110100,
        0b011001000,
        0b111010000,
        0b110100000,
    ];
    const TARGET: u16 = 0b000000001;
    const ALL_COMBOS: usize = 1 << 9;
    let mut ans = u32::MAX;
    for combo in 0..ALL_COMBOS {
        let mut effect = 0u16;
        for i in 0..9 {
            if combo & (1 << i) != 0 {
                effect ^= MASKS[i];
            }
        }
        if effect == TARGET {
            ans = ans.min(combo.count_ones());
        }
    }
    println!("{}", ans);
}
```

## LeetCode 70：爬楼梯

小米面试题。

### 思路

到达第 `n` 阶只能从第 `n - 1` 阶走一步，或者从第 `n - 2` 阶走两步，因此状态转移为 `f(n) = f(n - 1) + f(n - 2)`。这里只保留前两个状态，将空间复杂度降为 `O(1)`。

### Rust 实现

```rust
impl Solution {
    pub fn climb_stairs(n: i32) -> i32 {
        if n <= 2 {
            return n;
        }
        let mut i = 1;
        let mut j = 2;
        for _ in 3..=n {
            let temp = i + j;
            i = j;
            j = temp;
        }
        j
    }
}
```

## LeetCode 42：接雨水

[Trapping Rain Water](https://leetcode.com/problems/trapping-rain-water/) · Hard

### 题目

给定一个非负整数数组，每个元素表示宽度为 `1` 的柱子高度。计算这些柱子在下雨后能够接住多少单位的水。

### 思路

一根柱子上方能够接住的水，取决于它左右两侧最高柱子中较低的一侧。用两个指针从数组两端向中间移动，同时维护 `left_max` 和 `right_max`。

当左侧柱子不高于右侧柱子时，左侧的接水量已经可以由 `left_max` 确定；反之则处理右侧。这样不需要提前计算两个方向的最大值数组，只需一次遍历和常数额外空间。

时间复杂度为 `O(n)`，空间复杂度为 `O(1)`。

### Rust 实现

```rust
impl Solution {
    pub fn trap(height: Vec<i32>) -> i32 {
        if height.len() < 3 {
            return 0;
        }

        let mut left = 0;
        let mut right = height.len() - 1;
        let mut left_max = 0;
        let mut right_max = 0;
        let mut water = 0;

        while left < right {
            if height[left] <= height[right] {
                left_max = left_max.max(height[left]);
                water += left_max - height[left];
                left += 1;
            } else {
                right_max = right_max.max(height[right]);
                water += right_max - height[right];
                right -= 1;
            }
        }

        water
    }
}
```

## LeetCode 239：滑动窗口最大值

[Sliding Window Maximum](https://leetcode.com/problems/sliding-window-maximum/) · Hard

### 题目

给定一个整数数组和大小为 `k` 的滑动窗口。窗口每次向右移动一位，返回每个窗口中的最大值。

### 思路

使用双端队列保存元素下标，并让队列中的元素值始终单调递减。加入新元素前，先移除已经离开窗口的队首下标，再从队尾移除所有不大于新元素的下标，因为它们不可能再成为后续窗口的最大值。

每个下标最多入队和出队各一次，因此时间复杂度为 `O(n)`；队列最多保存 `k` 个下标，空间复杂度为 `O(k)`。

### Rust 实现

```rust
use std::collections::VecDeque;

impl Solution {
    pub fn max_sliding_window(nums: Vec<i32>, k: i32) -> Vec<i32> {
        let k = k as usize;
        let mut queue: VecDeque<usize> = VecDeque::with_capacity(k);
        let mut result = Vec::with_capacity(nums.len() - k + 1);

        for right in 0..nums.len() {
            while queue
                .front()
                .is_some_and(|&index| index + k <= right)
            {
                queue.pop_front();
            }

            while queue
                .back()
                .is_some_and(|&index| nums[index] <= nums[right])
            {
                queue.pop_back();
            }

            queue.push_back(right);

            if right + 1 >= k {
                result.push(nums[*queue.front().unwrap()]);
            }
        }

        result
    }
}
```
