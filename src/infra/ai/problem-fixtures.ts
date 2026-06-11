/**
 * Hand-authored battle problems — the fixture library the curated drafter draws
 * from when no Anthropic key is configured (the dev/seed path). Every problem is
 * a real, solvable stdin/stdout task with a working Python reference solution
 * and hidden IO tests that ACTUALLY pass (machine-verified in Judge0 / locally
 * by the seed script before any insert).
 *
 * Python is the reference language throughout because it round-trips most
 * reliably through the sandboxed Judge0 on cgroup v2 / WSL2 (the JVM and Node
 * have heap-reservation issues there — a documented infra caveat). Players still
 * answer in any supported language at battle time (M15); the reference solution
 * only verifies the tests.
 *
 * Tiers: easy (warm-ups, single concept), medium (a real algorithm or two
 * combined), hard (non-trivial logic / DP / graph-ish reasoning).
 */

import type { ProblemSpec } from '@/domain/battles';

/** Every fixture is a Python-referenced spec; the drafter tags source/status. */
export const PROBLEM_FIXTURES: readonly ProblemSpec[] = [
  // ─── EASY ────────────────────────────────────────────────────────────────
  {
    slug: 'sum-two-integers',
    title: 'Sum of Two Integers',
    tier: 'easy',
    statementMd: 'Read two space-separated integers `a` and `b` on one line. Print their sum.',
    referenceLanguage: 'python',
    referenceSolution: 'a, b = map(int, input().split())\nprint(a + b)',
    hiddenTests: [
      { input: '2 3', expectedOutput: '5' },
      { input: '-4 10', expectedOutput: '6' },
      { input: '0 0', expectedOutput: '0' },
      { input: '1000000 2000000', expectedOutput: '3000000' },
    ],
  },
  {
    slug: 'maximum-of-three',
    title: 'Maximum of Three',
    tier: 'easy',
    statementMd: 'Read three space-separated integers. Print the largest of them.',
    referenceLanguage: 'python',
    referenceSolution: 'nums = list(map(int, input().split()))\nprint(max(nums))',
    hiddenTests: [
      { input: '1 2 3', expectedOutput: '3' },
      { input: '9 4 7', expectedOutput: '9' },
      { input: '-1 -5 -3', expectedOutput: '-1' },
      { input: '5 5 5', expectedOutput: '5' },
    ],
  },
  {
    slug: 'even-or-odd',
    title: 'Even or Odd',
    tier: 'easy',
    statementMd: 'Read a single integer `n`. Print `Even` if it is even, otherwise print `Odd`.',
    referenceLanguage: 'python',
    referenceSolution: "n = int(input())\nprint('Even' if n % 2 == 0 else 'Odd')",
    hiddenTests: [
      { input: '4', expectedOutput: 'Even' },
      { input: '7', expectedOutput: 'Odd' },
      { input: '0', expectedOutput: 'Even' },
      { input: '-3', expectedOutput: 'Odd' },
    ],
  },
  {
    slug: 'reverse-string',
    title: 'Reverse a String',
    tier: 'easy',
    statementMd: 'Read a single line of text. Print it reversed.',
    referenceLanguage: 'python',
    referenceSolution: 's = input()\nprint(s[::-1])',
    hiddenTests: [
      { input: 'hello', expectedOutput: 'olleh' },
      { input: 'racecar', expectedOutput: 'racecar' },
      { input: 'ab', expectedOutput: 'ba' },
      { input: 'Junior Dev', expectedOutput: 'veD roinuJ' },
    ],
  },
  {
    slug: 'count-vowels',
    title: 'Count the Vowels',
    tier: 'easy',
    statementMd:
      'Read a single line of lowercase text. Print how many of its characters are vowels (`a`, `e`, `i`, `o`, `u`).',
    referenceLanguage: 'python',
    referenceSolution: "s = input()\nprint(sum(1 for c in s if c in 'aeiou'))",
    hiddenTests: [
      { input: 'hello', expectedOutput: '2' },
      { input: 'rhythm', expectedOutput: '0' },
      { input: 'aeiou', expectedOutput: '5' },
      { input: 'programming', expectedOutput: '3' },
    ],
  },
  {
    slug: 'sum-to-n',
    title: 'Sum from One to N',
    tier: 'easy',
    statementMd:
      'Read a single non-negative integer `n`. Print the sum of all integers from `1` to `n` inclusive (print `0` when `n` is `0`).',
    referenceLanguage: 'python',
    referenceSolution: 'n = int(input())\nprint(n * (n + 1) // 2)',
    hiddenTests: [
      { input: '5', expectedOutput: '15' },
      { input: '1', expectedOutput: '1' },
      { input: '0', expectedOutput: '0' },
      { input: '100', expectedOutput: '5050' },
    ],
  },
  {
    slug: 'factorial',
    title: 'Factorial',
    tier: 'easy',
    statementMd:
      'Read a single non-negative integer `n` (`n` <= 20). Print `n!` (the product of all integers from `1` to `n`; `0!` is `1`).',
    referenceLanguage: 'python',
    referenceSolution: 'import math\nn = int(input())\nprint(math.factorial(n))',
    hiddenTests: [
      { input: '5', expectedOutput: '120' },
      { input: '0', expectedOutput: '1' },
      { input: '1', expectedOutput: '1' },
      { input: '10', expectedOutput: '3628800' },
    ],
  },
  {
    slug: 'fizzbuzz-n',
    title: 'FizzBuzz to N',
    tier: 'easy',
    statementMd:
      'Read a single integer `n`. Print the numbers `1` to `n`, one per line, but print `Fizz` for multiples of 3, `Buzz` for multiples of 5, and `FizzBuzz` for multiples of both.',
    referenceLanguage: 'python',
    referenceSolution:
      "n = int(input())\nfor i in range(1, n + 1):\n    if i % 15 == 0:\n        print('FizzBuzz')\n    elif i % 3 == 0:\n        print('Fizz')\n    elif i % 5 == 0:\n        print('Buzz')\n    else:\n        print(i)",
    hiddenTests: [
      { input: '5', expectedOutput: '1\n2\nFizz\n4\nBuzz' },
      { input: '3', expectedOutput: '1\n2\nFizz' },
      {
        input: '15',
        expectedOutput: '1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz',
      },
      { input: '1', expectedOutput: '1' },
    ],
  },
  {
    slug: 'average-of-list',
    title: 'Average of a List',
    tier: 'easy',
    statementMd:
      'The first line contains an integer `n`. The second line contains `n` space-separated integers. Print their average, rounded to exactly two decimal places.',
    referenceLanguage: 'python',
    referenceSolution:
      "n = int(input())\nnums = list(map(int, input().split()))\nprint(f'{sum(nums) / n:.2f}')",
    hiddenTests: [
      { input: '3\n1 2 3', expectedOutput: '2.00' },
      { input: '4\n10 20 30 40', expectedOutput: '25.00' },
      { input: '2\n1 2', expectedOutput: '1.50' },
      { input: '1\n7', expectedOutput: '7.00' },
    ],
  },
  {
    slug: 'count-words',
    title: 'Count the Words',
    tier: 'easy',
    statementMd:
      'Read a single line of text. Print how many whitespace-separated words it contains.',
    referenceLanguage: 'python',
    referenceSolution: 'print(len(input().split()))',
    hiddenTests: [
      { input: 'the quick brown fox', expectedOutput: '4' },
      { input: 'hello', expectedOutput: '1' },
      { input: 'a b c d e f', expectedOutput: '6' },
      { input: 'one  two   three', expectedOutput: '3' },
    ],
  },
  {
    slug: 'celsius-to-fahrenheit',
    title: 'Celsius to Fahrenheit',
    tier: 'easy',
    statementMd:
      'Read a single integer Celsius temperature `c`. Print the Fahrenheit equivalent (`c * 9 / 5 + 32`) as an integer (the inputs are chosen so the result is always whole).',
    referenceLanguage: 'python',
    referenceSolution: 'c = int(input())\nprint(c * 9 // 5 + 32)',
    hiddenTests: [
      { input: '0', expectedOutput: '32' },
      { input: '100', expectedOutput: '212' },
      { input: '-40', expectedOutput: '-40' },
      { input: '37', expectedOutput: '98' },
    ],
  },
  {
    slug: 'digit-sum',
    title: 'Sum of Digits',
    tier: 'easy',
    statementMd: 'Read a single non-negative integer `n`. Print the sum of its decimal digits.',
    referenceLanguage: 'python',
    referenceSolution: 'n = input().strip()\nprint(sum(int(d) for d in n))',
    hiddenTests: [
      { input: '123', expectedOutput: '6' },
      { input: '0', expectedOutput: '0' },
      { input: '9999', expectedOutput: '36' },
      { input: '1080', expectedOutput: '9' },
    ],
  },

  // ─── MEDIUM ──────────────────────────────────────────────────────────────
  {
    slug: 'is-prime',
    title: 'Primality Test',
    tier: 'medium',
    statementMd:
      'Read a single integer `n`. Print `Yes` if `n` is a prime number, otherwise print `No`. (`n` can be up to 10^9.)',
    referenceLanguage: 'python',
    referenceSolution:
      "n = int(input())\n\ndef is_prime(x):\n    if x < 2:\n        return False\n    i = 2\n    while i * i <= x:\n        if x % i == 0:\n            return False\n        i += 1\n    return True\n\nprint('Yes' if is_prime(n) else 'No')",
    hiddenTests: [
      { input: '7', expectedOutput: 'Yes' },
      { input: '1', expectedOutput: 'No' },
      { input: '100', expectedOutput: 'No' },
      { input: '97', expectedOutput: 'Yes' },
      { input: '999983', expectedOutput: 'Yes' },
    ],
  },
  {
    slug: 'fibonacci-nth',
    title: 'Nth Fibonacci',
    tier: 'medium',
    statementMd:
      'Read a single integer `n` (`0 <= n <= 90`). Print the `n`-th Fibonacci number, where `F(0) = 0`, `F(1) = 1`.',
    referenceLanguage: 'python',
    referenceSolution:
      'n = int(input())\na, b = 0, 1\nfor _ in range(n):\n    a, b = b, a + b\nprint(a)',
    hiddenTests: [
      { input: '0', expectedOutput: '0' },
      { input: '1', expectedOutput: '1' },
      { input: '10', expectedOutput: '55' },
      { input: '20', expectedOutput: '6765' },
      { input: '50', expectedOutput: '12586269025' },
    ],
  },
  {
    slug: 'gcd-two-numbers',
    title: 'Greatest Common Divisor',
    tier: 'medium',
    statementMd:
      'Read two space-separated positive integers `a` and `b`. Print their greatest common divisor.',
    referenceLanguage: 'python',
    referenceSolution: 'import math\na, b = map(int, input().split())\nprint(math.gcd(a, b))',
    hiddenTests: [
      { input: '12 18', expectedOutput: '6' },
      { input: '17 5', expectedOutput: '1' },
      { input: '100 100', expectedOutput: '100' },
      { input: '48 36', expectedOutput: '12' },
    ],
  },
  {
    slug: 'count-distinct',
    title: 'Count Distinct Values',
    tier: 'medium',
    statementMd:
      'The first line contains an integer `n`. The second line contains `n` space-separated integers. Print how many distinct values appear.',
    referenceLanguage: 'python',
    referenceSolution: 'n = int(input())\nnums = input().split()\nprint(len(set(nums)))',
    hiddenTests: [
      { input: '5\n1 2 2 3 3', expectedOutput: '3' },
      { input: '4\n7 7 7 7', expectedOutput: '1' },
      { input: '6\n1 2 3 4 5 6', expectedOutput: '6' },
      { input: '3\n-1 -1 0', expectedOutput: '2' },
    ],
  },
  {
    slug: 'second-largest',
    title: 'Second Largest',
    tier: 'medium',
    statementMd:
      'The first line contains an integer `n` (`n >= 2`). The second line contains `n` space-separated integers. Print the second-largest DISTINCT value. If there is no second distinct value, print `None`.',
    referenceLanguage: 'python',
    referenceSolution:
      "n = int(input())\nvals = sorted(set(map(int, input().split())), reverse=True)\nprint(vals[1] if len(vals) > 1 else 'None')",
    hiddenTests: [
      { input: '5\n3 1 4 1 5', expectedOutput: '4' },
      { input: '3\n7 7 7', expectedOutput: 'None' },
      { input: '4\n10 20 20 30', expectedOutput: '20' },
      { input: '2\n5 9', expectedOutput: '5' },
    ],
  },
  {
    slug: 'binary-to-decimal',
    title: 'Binary to Decimal',
    tier: 'medium',
    statementMd:
      'Read a single binary string (only `0` and `1`). Print its value as a decimal integer.',
    referenceLanguage: 'python',
    referenceSolution: 's = input().strip()\nprint(int(s, 2))',
    hiddenTests: [
      { input: '101', expectedOutput: '5' },
      { input: '0', expectedOutput: '0' },
      { input: '1111', expectedOutput: '15' },
      { input: '100000000', expectedOutput: '256' },
    ],
  },
  {
    slug: 'anagram-check',
    title: 'Anagram Check',
    tier: 'medium',
    statementMd:
      'Two lines each contain a lowercase string. Print `Yes` if the two strings are anagrams of each other (same letters, same counts, any order), otherwise `No`.',
    referenceLanguage: 'python',
    referenceSolution: "a = input()\nb = input()\nprint('Yes' if sorted(a) == sorted(b) else 'No')",
    hiddenTests: [
      { input: 'listen\nsilent', expectedOutput: 'Yes' },
      { input: 'hello\nworld', expectedOutput: 'No' },
      { input: 'abc\ncba', expectedOutput: 'Yes' },
      { input: 'aabb\nabab', expectedOutput: 'Yes' },
      { input: 'abc\nabcd', expectedOutput: 'No' },
    ],
  },
  {
    slug: 'running-max',
    title: 'Running Maximum',
    tier: 'medium',
    statementMd:
      'The first line contains an integer `n`. The second line contains `n` space-separated integers. Print, on one line, the running maximum: for each position, the largest value seen so far (space-separated).',
    referenceLanguage: 'python',
    referenceSolution:
      "n = int(input())\nnums = list(map(int, input().split()))\nout = []\ncur = nums[0]\nfor x in nums:\n    cur = max(cur, x)\n    out.append(str(cur))\nprint(' '.join(out))",
    hiddenTests: [
      { input: '5\n1 3 2 5 4', expectedOutput: '1 3 3 5 5' },
      { input: '3\n5 4 3', expectedOutput: '5 5 5' },
      { input: '4\n1 2 3 4', expectedOutput: '1 2 3 4' },
      { input: '1\n7', expectedOutput: '7' },
    ],
  },
  {
    slug: 'two-sum-exists',
    title: 'Two Sum Exists',
    tier: 'medium',
    statementMd:
      'The first line contains `n` and a target `t` (space-separated). The second line contains `n` space-separated integers. Print `Yes` if some two DISTINCT positions sum to `t`, otherwise `No`.',
    referenceLanguage: 'python',
    referenceSolution:
      "n, t = map(int, input().split())\nnums = list(map(int, input().split()))\nseen = set()\nfound = False\nfor x in nums:\n    if t - x in seen:\n        found = True\n        break\n    seen.add(x)\nprint('Yes' if found else 'No')",
    hiddenTests: [
      { input: '4 9\n2 7 11 15', expectedOutput: 'Yes' },
      { input: '3 8\n1 2 4', expectedOutput: 'No' },
      { input: '4 8\n4 4 1 2', expectedOutput: 'Yes' },
      { input: '2 10\n5 5', expectedOutput: 'Yes' },
      { input: '1 5\n5', expectedOutput: 'No' },
    ],
  },
  {
    slug: 'caesar-cipher',
    title: 'Caesar Cipher',
    tier: 'medium',
    statementMd:
      'The first line contains an integer shift `k` (`0 <= k < 26`). The second line contains a lowercase string. Print the string with each letter shifted forward by `k` positions in the alphabet, wrapping around from `z` to `a`.',
    referenceLanguage: 'python',
    referenceSolution:
      "k = int(input())\ns = input()\nout = ''.join(chr((ord(c) - 97 + k) % 26 + 97) for c in s)\nprint(out)",
    hiddenTests: [
      { input: '3\nabc', expectedOutput: 'def' },
      { input: '1\nxyz', expectedOutput: 'yza' },
      { input: '0\nhello', expectedOutput: 'hello' },
      { input: '13\nhello', expectedOutput: 'uryyb' },
    ],
  },
  {
    slug: 'matrix-row-sums',
    title: 'Matrix Row Sums',
    tier: 'medium',
    statementMd:
      'The first line contains two integers `r` and `c`. The next `r` lines each contain `c` space-separated integers. Print the sum of each row, one per line.',
    referenceLanguage: 'python',
    referenceSolution:
      'r, c = map(int, input().split())\nfor _ in range(r):\n    row = list(map(int, input().split()))\n    print(sum(row))',
    hiddenTests: [
      { input: '2 3\n1 2 3\n4 5 6', expectedOutput: '6\n15' },
      { input: '1 1\n7', expectedOutput: '7' },
      { input: '3 2\n0 0\n-1 1\n10 20', expectedOutput: '0\n0\n30' },
    ],
  },
  {
    slug: 'balanced-brackets',
    title: 'Balanced Brackets',
    tier: 'medium',
    statementMd:
      'Read a single line containing only the characters `(`, `)`, `[`, `]`, `{`, `}`. Print `Yes` if the brackets are balanced and correctly nested, otherwise `No`.',
    referenceLanguage: 'python',
    referenceSolution:
      "s = input().strip()\npairs = {')': '(', ']': '[', '}': '{'}\nstack = []\nok = True\nfor c in s:\n    if c in '([{':\n        stack.append(c)\n    else:\n        if not stack or stack.pop() != pairs[c]:\n            ok = False\n            break\nprint('Yes' if ok and not stack else 'No')",
    hiddenTests: [
      { input: '()[]{}', expectedOutput: 'Yes' },
      { input: '([{}])', expectedOutput: 'Yes' },
      { input: '(]', expectedOutput: 'No' },
      { input: '(((', expectedOutput: 'No' },
      { input: '{[()]}', expectedOutput: 'Yes' },
    ],
  },

  // ─── HARD ────────────────────────────────────────────────────────────────
  {
    slug: 'longest-increasing-run',
    title: 'Longest Increasing Run',
    tier: 'hard',
    statementMd:
      'The first line contains an integer `n`. The second line contains `n` space-separated integers. Print the length of the longest STRICTLY increasing contiguous run.',
    referenceLanguage: 'python',
    referenceSolution:
      'n = int(input())\nnums = list(map(int, input().split()))\nbest = cur = 1\nfor i in range(1, n):\n    if nums[i] > nums[i - 1]:\n        cur += 1\n        best = max(best, cur)\n    else:\n        cur = 1\nprint(best)',
    hiddenTests: [
      { input: '6\n1 2 1 2 3 4', expectedOutput: '4' },
      { input: '5\n5 4 3 2 1', expectedOutput: '1' },
      { input: '4\n1 2 3 4', expectedOutput: '4' },
      { input: '7\n1 2 2 3 4 5 1', expectedOutput: '4' },
    ],
  },
  {
    slug: 'coin-change-min',
    title: 'Minimum Coins',
    tier: 'hard',
    statementMd:
      'The first line contains the number of coin denominations `m` and a target amount `a` (space-separated). The second line contains `m` space-separated positive coin values. Print the minimum number of coins (unlimited supply of each) that sum EXACTLY to `a`, or `-1` if impossible.',
    referenceLanguage: 'python',
    referenceSolution:
      "m, a = map(int, input().split())\ncoins = list(map(int, input().split()))\nINF = float('inf')\ndp = [0] + [INF] * a\nfor v in range(1, a + 1):\n    for c in coins:\n        if c <= v and dp[v - c] + 1 < dp[v]:\n            dp[v] = dp[v - c] + 1\nprint(dp[a] if dp[a] != INF else -1)",
    hiddenTests: [
      { input: '3 11\n1 2 5', expectedOutput: '3' },
      { input: '1 3\n2', expectedOutput: '-1' },
      { input: '2 6\n1 3', expectedOutput: '2' },
      { input: '3 0\n1 2 5', expectedOutput: '0' },
      { input: '2 7\n2 4', expectedOutput: '-1' },
    ],
  },
  {
    slug: 'edit-distance',
    title: 'Edit Distance',
    tier: 'hard',
    statementMd:
      'Two lines each contain a string. Print the minimum number of single-character insertions, deletions, or substitutions needed to turn the first string into the second (Levenshtein distance).',
    referenceLanguage: 'python',
    referenceSolution:
      "import sys\nlines = sys.stdin.read().split('\\n')\na = lines[0] if len(lines) > 0 else ''\nb = lines[1] if len(lines) > 1 else ''\nm, n = len(a), len(b)\ndp = [[0] * (n + 1) for _ in range(m + 1)]\nfor i in range(m + 1):\n    dp[i][0] = i\nfor j in range(n + 1):\n    dp[0][j] = j\nfor i in range(1, m + 1):\n    for j in range(1, n + 1):\n        if a[i - 1] == b[j - 1]:\n            dp[i][j] = dp[i - 1][j - 1]\n        else:\n            dp[i][j] = 1 + min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])\nprint(dp[m][n])",
    hiddenTests: [
      { input: 'kitten\nsitting', expectedOutput: '3' },
      { input: 'abc\nabc', expectedOutput: '0' },
      { input: 'flaw\nlawn', expectedOutput: '2' },
      { input: 'a\n', expectedOutput: '1' },
    ],
  },
  {
    slug: 'max-subarray-sum',
    title: 'Maximum Subarray Sum',
    tier: 'hard',
    statementMd:
      'The first line contains an integer `n`. The second line contains `n` space-separated integers (may be negative). Print the maximum sum of any non-empty contiguous subarray (Kadane’s algorithm).',
    referenceLanguage: 'python',
    referenceSolution:
      'n = int(input())\nnums = list(map(int, input().split()))\nbest = cur = nums[0]\nfor x in nums[1:]:\n    cur = max(x, cur + x)\n    best = max(best, cur)\nprint(best)',
    hiddenTests: [
      { input: '9\n-2 1 -3 4 -1 2 1 -5 4', expectedOutput: '6' },
      { input: '5\n-1 -2 -3 -4 -5', expectedOutput: '-1' },
      { input: '4\n1 2 3 4', expectedOutput: '10' },
      { input: '1\n-7', expectedOutput: '-7' },
    ],
  },
  {
    slug: 'count-islands',
    title: 'Count Islands',
    tier: 'hard',
    statementMd:
      'The first line contains two integers `r` and `c`. The next `r` lines each contain a string of `c` characters (`0` for water, `1` for land). Print the number of islands — maximal groups of land cells connected horizontally or vertically.',
    referenceLanguage: 'python',
    referenceSolution:
      "r, c = map(int, input().split())\ngrid = [input() for _ in range(r)]\nseen = [[False] * c for _ in range(r)]\n\ndef flood(sr, sc):\n    stack = [(sr, sc)]\n    seen[sr][sc] = True\n    while stack:\n        x, y = stack.pop()\n        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):\n            nx, ny = x + dx, y + dy\n            if 0 <= nx < r and 0 <= ny < c and not seen[nx][ny] and grid[nx][ny] == '1':\n                seen[nx][ny] = True\n                stack.append((nx, ny))\n\ncount = 0\nfor i in range(r):\n    for j in range(c):\n        if grid[i][j] == '1' and not seen[i][j]:\n            count += 1\n            flood(i, j)\nprint(count)",
    hiddenTests: [
      { input: '3 3\n101\n010\n101', expectedOutput: '5' },
      { input: '2 2\n11\n11', expectedOutput: '1' },
      { input: '3 3\n000\n000\n000', expectedOutput: '0' },
      { input: '3 4\n1100\n1100\n0011', expectedOutput: '2' },
    ],
  },
  {
    slug: 'longest-common-subsequence',
    title: 'Longest Common Subsequence',
    tier: 'hard',
    statementMd:
      'Two lines each contain a string. Print the length of their longest common subsequence (characters appearing in both strings in the same relative order, not necessarily contiguous).',
    referenceLanguage: 'python',
    referenceSolution:
      'a = input()\nb = input()\nm, n = len(a), len(b)\ndp = [[0] * (n + 1) for _ in range(m + 1)]\nfor i in range(1, m + 1):\n    for j in range(1, n + 1):\n        if a[i - 1] == b[j - 1]:\n            dp[i][j] = dp[i - 1][j - 1] + 1\n        else:\n            dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])\nprint(dp[m][n])',
    hiddenTests: [
      { input: 'abcde\nace', expectedOutput: '3' },
      { input: 'abc\ndef', expectedOutput: '0' },
      { input: 'aggtab\ngxtxayb', expectedOutput: '4' },
      { input: 'aaaa\naa', expectedOutput: '2' },
    ],
  },
  {
    slug: 'sort-by-frequency',
    title: 'Sort by Frequency',
    tier: 'hard',
    statementMd:
      'The first line contains an integer `n`. The second line contains `n` space-separated integers. Print them sorted by DESCENDING frequency; ties (equal frequency) break by ASCENDING value. Output the values space-separated on one line, each repeated its number of times.',
    referenceLanguage: 'python',
    referenceSolution:
      "from collections import Counter\nn = int(input())\nnums = list(map(int, input().split()))\nfreq = Counter(nums)\norder = sorted(freq.keys(), key=lambda v: (-freq[v], v))\nout = []\nfor v in order:\n    out.extend([str(v)] * freq[v])\nprint(' '.join(out))",
    hiddenTests: [
      { input: '6\n1 1 2 2 2 3', expectedOutput: '2 2 2 1 1 3' },
      { input: '4\n4 3 2 1', expectedOutput: '1 2 3 4' },
      { input: '5\n5 5 4 4 3', expectedOutput: '4 4 5 5 3' },
      { input: '3\n7 7 7', expectedOutput: '7 7 7' },
    ],
  },
  {
    slug: 'knapsack-01',
    title: '0/1 Knapsack',
    tier: 'hard',
    statementMd:
      'The first line contains the item count `n` and capacity `W` (space-separated). Each of the next `n` lines contains two integers: an item’s weight and value. Each item may be taken at most once. Print the maximum total value of items whose total weight does not exceed `W`.',
    referenceLanguage: 'python',
    referenceSolution:
      'n, W = map(int, input().split())\ndp = [0] * (W + 1)\nfor _ in range(n):\n    wt, val = map(int, input().split())\n    for cap in range(W, wt - 1, -1):\n        if dp[cap - wt] + val > dp[cap]:\n            dp[cap] = dp[cap - wt] + val\nprint(dp[W])',
    hiddenTests: [
      { input: '3 50\n10 60\n20 100\n30 120', expectedOutput: '220' },
      { input: '2 3\n4 10\n5 20', expectedOutput: '0' },
      { input: '1 5\n5 99', expectedOutput: '99' },
      { input: '4 10\n5 10\n4 40\n6 30\n3 50', expectedOutput: '90' },
    ],
  },
];
