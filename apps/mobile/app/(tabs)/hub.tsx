// MoniMata - zero-based budgeting for Nigerians
// Copyright (C) 2026  MoniMata Contributors
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

/**
 * Knowledge Hub screen — articles, video courses, and quizzes.
 *
 * Phase 13 — all data is static seed (fake). Phase 14+ will connect to
 * backend CMS endpoints and award XP via the gamification service.
 * See docs/UI_MIGRATION_PLAN.md Phase 13 for backend design notes.
 *
 * Accessibility: every interactive element has accessibilityRole + accessibilityLabel.
 * Touch targets: all tappable rows/cards ≥ 44 pt.
 */

import { router } from 'expo-router';
import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ff } from '@/lib/typography';
import { useTheme } from '@/lib/theme';
import { useToast } from '@/components/Toast';
import { Chip } from '@/components/ui/Chip';
import { hitSlop, layout, radius, shadow, spacing } from '@/lib/tokens';

// ── Types ─────────────────────────────────────────────────────────────────────

type HubTab = 'articles' | 'courses' | 'quizzes';

type ThumbColor = 'g' | 'a' | 'b' | 'r' | 'p' | 't';

interface Article {
  id: string;
  emoji: string;
  tag: string;
  title: string;
  readMin: number;
  xp: number;
  thumbColor: ThumbColor;
  category: string;
  featured?: boolean;
  featuredMeta?: string;
}

interface Course {
  id: string;
  emoji: string;
  tag: string;
  title: string;
  description: string;
  lessons: number;
  durationMin: number;
  xp: number;
  progressPct: number;
  gradientColor: 'g' | 'b' | 'a' | 'p';
}

interface Quiz {
  id: string;
  emoji: string;
  title: string;
  description: string;
  xp: number;
  score?: string;       // e.g. "8/10" — undefined = not attempted
  isDaily?: boolean;
  thumbColor: ThumbColor;
}

// ── Fake seed data ────────────────────────────────────────────────────────────
// Phase 14 will replace with API calls to the Content service.

const CATEGORIES = ['All', 'Budgeting', 'Saving', 'Investing', 'Debt'] as const;

const ARTICLES: Article[] = [
  {
    id: '1',
    emoji: '📖',
    tag: 'Budgeting',
    category: 'Budgeting',
    title: 'Zero-Based Budgeting: The Nigerian Way',
    readMin: 5,
    xp: 120,
    thumbColor: 'g',
    featured: true,
    featuredMeta: 'By MoniMata Team',
  },
  {
    id: '2',
    emoji: '💰',
    tag: 'Saving',
    category: 'Saving',
    title: 'How to Save on a ₦150k Salary in Lagos',
    readMin: 4,
    xp: 80,
    thumbColor: 'g',
  },
  {
    id: '3',
    emoji: '📊',
    tag: 'Budgeting',
    category: 'Budgeting',
    title: 'The 50/30/20 Rule: Does It Work in Nigeria?',
    readMin: 6,
    xp: 100,
    thumbColor: 'a',
  },
  {
    id: '4',
    emoji: '📈',
    tag: 'Investing',
    category: 'Investing',
    title: 'Starting to Invest with ₦10,000',
    readMin: 8,
    xp: 150,
    thumbColor: 'b',
  },
  {
    id: '5',
    emoji: '🏦',
    tag: 'Debt',
    category: 'Debt',
    title: 'Avoiding the Debt Trap: Smart Credit Habits',
    readMin: 5,
    xp: 90,
    thumbColor: 'r',
  },
];

const COURSES: Course[] = [
  {
    id: '1',
    emoji: '💰',
    tag: 'Budgeting',
    title: 'Zero-Based Budgeting Masterclass',
    description: 'Give every Naira a job. Master ZBB from scratch.',
    lessons: 8,
    durationMin: 47,
    xp: 800,
    progressPct: 0.37,
    gradientColor: 'g',
  },
  {
    id: '2',
    emoji: '💸',
    tag: 'Saving',
    title: 'Saving on a Nigerian Salary',
    description: 'Real tactics for saving ₦5k–₦50k/month.',
    lessons: 6,
    durationMin: 32,
    xp: 600,
    progressPct: 0,
    gradientColor: 'a',
  },
  {
    id: '3',
    emoji: '📈',
    tag: 'Investing',
    title: 'Your First ₦10k Investment',
    description: 'Treasury bills, money markets, and mutual funds.',
    lessons: 6,
    durationMin: 38,
    xp: 600,
    progressPct: 0.16,
    gradientColor: 'b',
  },
  {
    id: '4',
    emoji: '🛡️',
    tag: 'Saving',
    title: 'Building an Emergency Fund',
    description: '3–6 months cover strategy for Nigerians.',
    lessons: 5,
    durationMin: 28,
    xp: 500,
    progressPct: 0,
    gradientColor: 'p',
  },
];

const QUIZZES: Quiz[] = [
  {
    id: 'daily',
    emoji: '🧠',
    title: 'Daily Money Quiz',
    description: '5 questions · +100 XP · Resets daily',
    xp: 100,
    thumbColor: 'g',
    isDaily: true,
  },
  {
    id: '2',
    emoji: '📋',
    title: 'Budgeting Basics',
    description: '10 questions on zero-based budgeting',
    xp: 150,
    score: '8/10',
    thumbColor: 'g',
  },
  {
    id: '3',
    emoji: '💰',
    title: 'Nigerian Banking',
    description: 'Know your BVN, NIN, and CBN rules',
    xp: 120,
    thumbColor: 'a',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Maps a ThumbColor variant to the correct theme token key. */
type SubtleToken =
  | 'successSubtle'
  | 'warningSubtle'
  | 'infoSubtle'
  | 'errorSubtle'
  | 'purpleSubtle'
  | 'tealSubtle';

const THUMB_TOKEN: Record<ThumbColor, SubtleToken> = {
  g: 'successSubtle',
  a: 'warningSubtle',
  b: 'infoSubtle',
  r: 'errorSubtle',
  p: 'purpleSubtle',
  t: 'tealSubtle',
};

/** Gradient pair for course thumbnail (.course-thumb.g / .b / .a / .p) */
function courseGradient(color: Course['gradientColor']): [string, string] {
  switch (color) {
    case 'g': return ['#1B3A1B', '#2D6A2D'];
    case 'b': return ['#1E3A5F', '#2563EB'];
    case 'a': return ['#78350F', '#D97706'];
    case 'p': return ['#4C1D95', '#7C3AED'];
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Featured article hero card (.feat-card) */
function FeaturedCard({
  article,
  onPress,
  ss,
  colors,
}: {
  article: Article;
  onPress: () => void;
  ss: ReturnType<typeof makeStyles>;
  colors: ReturnType<typeof useTheme>;
}) {
  return (
    <TouchableOpacity
      style={[ss.featCard, { backgroundColor: colors.brand }]}
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={`Featured article: ${article.title}`}
    >
      {/* Decorative glow circle */}
      <View style={ss.featGlow} pointerEvents="none" />

      {/* Tag row */}
      <View style={ss.featTagRow}>
        <View style={ss.featTagPill}>
          <Text style={[ss.featTagTxt, { color: colors.lime, ...ff(700) }]}>
            Featured · {article.readMin} min read
          </Text>
        </View>
      </View>

      {/* Title */}
      <Text style={[ss.featTitle, { color: colors.white, ...ff(800) }]}>
        {article.title}
      </Text>

      {/* Meta row */}
      <View style={ss.featMeta}>
        <View style={ss.featXpBadge}>
          <Text style={[ss.featXpTxt, { color: colors.white, ...ff(700) }]}>
            +{article.xp} XP
          </Text>
        </View>
        {article.featuredMeta ? (
          <Text style={[ss.featMetaTxt, { color: colors.textInverseFaint }]}>
            {article.featuredMeta}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

/** Single article list row (.art-c) */
function ArticleCard({
  article,
  onPress,
  ss,
  colors,
}: {
  article: Article;
  onPress: () => void;
  ss: ReturnType<typeof makeStyles>;
  colors: ReturnType<typeof useTheme>;
}) {
  const thumbBg = colors[THUMB_TOKEN[article.thumbColor]];
  return (
    <TouchableOpacity
      style={[ss.artCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={`Article: ${article.title}`}
    >
      {/* Emoji thumbnail */}
      <View style={[ss.artThumb, { backgroundColor: thumbBg }]}>
        <Text style={ss.artEmoji}>{article.emoji}</Text>
      </View>

      {/* Content */}
      <View style={ss.artContent}>
        <Text style={[ss.artTag, { color: colors.brand, ...ff(700) }]}>{article.tag}</Text>
        <Text style={[ss.artTitle, { color: colors.textPrimary, ...ff(700) }]} numberOfLines={2}>
          {article.title}
        </Text>
        <View style={ss.artMeta}>
          <Text style={[ss.artMetaTxt, { color: colors.textMeta }]}>{article.readMin} min</Text>
          <View style={[ss.artXpBadge, { backgroundColor: colors.surface }]}>
            <Text style={[ss.artXpTxt, { color: colors.brand, ...ff(700) }]}>+{article.xp} XP</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

/** Horizontal course card — used in "In Progress" scroll (.course-card) */
function CourseCardMini({
  course,
  onPress,
  ss,
  colors,
}: {
  course: Course;
  onPress: () => void;
  ss: ReturnType<typeof makeStyles>;
  colors: ReturnType<typeof useTheme>;
}) {
  const [from, to] = courseGradient(course.gradientColor);
  return (
    <TouchableOpacity
      style={[ss.courseMini, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={`Course: ${course.title}`}
    >
      {/* Gradient thumbnail */}
      <LinearGradient
        colors={[from, to]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={ss.courseThumb}
      >
        <Text style={ss.courseThumbEmoji}>{course.emoji}</Text>
        {/* Play button */}
        <View style={ss.coursePlay}>
          <Ionicons name="play" size={10} color={colors.textPrimary} />
        </View>
      </LinearGradient>

      {/* Info */}
      <View style={ss.courseMiniInfo}>
        <Text style={[ss.courseTag, { color: colors.brand, ...ff(700) }]}>{course.tag}</Text>
        <Text style={[ss.courseTitle, { color: colors.textPrimary, ...ff(700) }]} numberOfLines={2}>
          {course.title}
        </Text>
        <View style={ss.courseMeta}>
          <Text style={[ss.courseLessons, { color: colors.textMeta }]}>{course.lessons} lessons</Text>
          <View style={[ss.courseXpBadge, { backgroundColor: colors.surface }]}>
            <Text style={[ss.courseXpTxt, { color: colors.brand, ...ff(700) }]}>+{course.xp} XP</Text>
          </View>
        </View>
        {/* Progress bar */}
        <View style={[ss.courseProg, { backgroundColor: colors.surfaceElevated }]}>
          <View
            style={[ss.courseProgFill, { backgroundColor: colors.brand, width: `${course.progressPct * 100}%` }]}
          />
        </View>
      </View>
    </TouchableOpacity>
  );
}

/** Full-width course list row — used in "All Courses" (.chal-c style) */
function CourseListRow({
  course,
  onPress,
  ss,
  colors,
}: {
  course: Course;
  onPress: () => void;
  ss: ReturnType<typeof makeStyles>;
  colors: ReturnType<typeof useTheme>;
}) {
  const [from, to] = courseGradient(course.gradientColor);

  // Progress bar color per gradient variant
  const progressColor =
    course.gradientColor === 'g' ? colors.brand
      : course.gradientColor === 'b' ? colors.info
        : course.gradientColor === 'a' ? colors.warning
          : colors.purple;

  return (
    <TouchableOpacity
      style={[ss.courseRow, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={`Course: ${course.title}`}
    >
      {/* Icon tile with gradient */}
      <LinearGradient colors={[from, to]} style={ss.courseRowIc}>
        <Text style={ss.courseRowEmoji}>{course.emoji}</Text>
      </LinearGradient>

      <View style={ss.courseRowInfo}>
        <Text style={[ss.chTtl, { color: colors.textPrimary, ...ff(700) }]}>{course.title}</Text>
        <Text style={[ss.chDesc, { color: colors.textMeta }]} numberOfLines={1}>
          {course.description}
        </Text>
        {/* Footer row */}
        <View style={ss.chFoot}>
          <View style={[ss.chXpBadge, { backgroundColor: colors.surface }]}>
            <Text style={[ss.chXpTxt, { color: colors.brand, ...ff(700) }]}>+{course.xp} XP</Text>
          </View>
          <Text style={[ss.chProgTxt, { color: colors.textMeta }]}>
            {course.lessons} lessons · {course.durationMin} min
          </Text>
        </View>
        {/* Progress bar */}
        {course.progressPct > 0 && (
          <View style={[ss.chBar, { backgroundColor: colors.surfaceElevated }]}>
            <View
              style={[ss.chFill, { backgroundColor: progressColor, width: `${course.progressPct * 100}%` }]}
            />
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

/** Quiz card row (.chal-c style) */
function QuizCard({
  quiz,
  onPress,
  ss,
  colors,
}: {
  quiz: Quiz;
  onPress: () => void;
  ss: ReturnType<typeof makeStyles>;
  colors: ReturnType<typeof useTheme>;
}) {
  const thumbBg = colors[THUMB_TOKEN[quiz.thumbColor]];
  return (
    <TouchableOpacity
      style={[ss.courseRow, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={`Quiz: ${quiz.title}`}
    >
      {/* Icon tile */}
      <View style={[ss.courseRowIc, { backgroundColor: thumbBg }]}>
        <Text style={ss.courseRowEmoji}>{quiz.emoji}</Text>
      </View>

      <View style={ss.courseRowInfo}>
        <Text style={[ss.chTtl, { color: colors.textPrimary, ...ff(700) }]}>{quiz.title}</Text>
        <Text style={[ss.chDesc, { color: colors.textMeta }]}>{quiz.description}</Text>
        <View style={ss.chFoot}>
          <View style={[ss.chXpBadge, { backgroundColor: colors.surface }]}>
            <Text style={[ss.chXpTxt, { color: colors.brand, ...ff(700) }]}>+{quiz.xp} XP</Text>
          </View>
          {quiz.score ? (
            <Text style={[ss.chProgTxt, { color: colors.brand, ...ff(600) }]}>
              Score: {quiz.score}
            </Text>
          ) : (
            <Text style={[ss.chProgTxt, { color: colors.textMeta }]}>Not attempted</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function HubScreen() {
  const colors = useTheme();
  const ss = makeStyles(colors);
  const insets = useSafeAreaInsets();
  const { info } = useToast();

  const [activeTab, setActiveTab] = useState<HubTab>('articles');
  const [activeCategory, setActiveCategory] = useState<string>('All');

  // Filter articles by selected category chip
  const visibleArticles = ARTICLES.filter(
    (a) => !a.featured && (activeCategory === 'All' || a.category === activeCategory),
  );

  // "In Progress" = courses with progressPct > 0
  const inProgressCourses = COURSES.filter((c) => c.progressPct > 0);

  function handleArticle(title: string) {
    info('📖', `Opening "${title}"… +${ARTICLES.find((a) => a.title === title)?.xp ?? 0} XP`);
  }

  function handleCourse(title: string) {
    info('🎬', `Opening "${title}"…`);
  }

  function handleQuiz(quiz: Quiz) {
    if (quiz.isDaily) {
      info('🎯', 'Daily quiz starting! Good luck!');
    } else {
      info('📋', `Opening "${quiz.title}"…`);
    }
  }

  return (
    <View style={[ss.root, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      {/* ── Dark-green header ───────────────────────────────────────────────── */}
      <View
        style={[
          ss.header,
          { paddingTop: insets.top + spacing.lg, backgroundColor: colors.darkGreen },
        ]}
      >
        {/* Title row */}
        <View style={ss.titleRow}>
          <TouchableOpacity
            style={[ss.backBtn, { backgroundColor: colors.overlayGhost, borderColor: colors.overlayGhostBorder }]}
            onPress={() => router.back()}
            hitSlop={hitSlop(36)}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={layout.iconMd} color={colors.white} />
          </TouchableOpacity>
          <Text style={[ss.titleTxt, { color: colors.white, ...ff(700) }]}>Knowledge Hub</Text>
          {/* Spacer to balance the back button */}
          <View style={ss.titleSpacer} />
        </View>

        {/* Hero copy */}
        <Text style={[ss.heroHeading, { color: colors.white, ...ff(800) }]}>
          Learn &amp; Earn 📚
        </Text>
        <Text style={[ss.heroSub, { color: colors.textInverseFaint }]}>
          Read articles · Watch courses · Earn XP
        </Text>

        {/* 3-tab pill switcher (.hub-tabs) */}
        <View style={[ss.hubTabs, { backgroundColor: colors.overlayGhost }]}>
          {(['articles', 'courses', 'quizzes'] as HubTab[]).map((tab) => {
            const isOn = activeTab === tab;
            const label = tab === 'articles' ? 'Articles' : tab === 'courses' ? 'Video Courses' : 'Quizzes';
            return (
              <TouchableOpacity
                key={tab}
                style={[
                  ss.hubTab,
                  isOn && { backgroundColor: colors.lime },
                ]}
                onPress={() => setActiveTab(tab)}
                accessibilityRole="tab"
                accessibilityLabel={label}
                accessibilityState={{ selected: isOn }}
              >
                <Text
                  style={[
                    ss.hubTabTxt,
                    { color: isOn ? colors.darkGreen : colors.textInverseFaint, ...ff(600) },
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── Tab content ─────────────────────────────────────────────────────── */}

      {/* ARTICLES TAB */}
      {activeTab === 'articles' && (
        <ScrollView
          style={ss.scroll}
          contentContainerStyle={ss.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Category filter chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={ss.chips}
          >
            {CATEGORIES.map((cat) => (
              <Chip
                key={cat}
                label={cat}
                selected={activeCategory === cat}
                onPress={() => setActiveCategory(cat)}
                accessibilityLabel={`Filter by ${cat}`}
              />
            ))}
          </ScrollView>

          {/* Featured article hero card */}
          {(activeCategory === 'All' || activeCategory === 'Budgeting') && (
            <FeaturedCard
              article={ARTICLES[0]!}
              onPress={() => handleArticle(ARTICLES[0]!.title)}
              ss={ss}
              colors={colors}
            />
          )}

          {/* Article list */}
          <View style={ss.artList}>
            {visibleArticles.map((article) => (
              <ArticleCard
                key={article.id}
                article={article}
                onPress={() => handleArticle(article.title)}
                ss={ss}
                colors={colors}
              />
            ))}
            {visibleArticles.length === 0 && (
              <View style={ss.emptyWrap}>
                <Text style={[ss.emptyTxt, { color: colors.textMeta, ...ff(500) }]}>
                  No articles in this category yet.
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* COURSES TAB */}
      {activeTab === 'courses' && (
        <ScrollView
          style={ss.scroll}
          contentContainerStyle={ss.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* In Progress section */}
          {inProgressCourses.length > 0 && (
            <>
              <Text style={[ss.sectionLbl, { color: colors.textMeta, ...ff(600) }]}>
                In Progress
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={ss.courseMiniRow}
              >
                {inProgressCourses.map((course) => (
                  <CourseCardMini
                    key={course.id}
                    course={course}
                    onPress={() => handleCourse(course.title)}
                    ss={ss}
                    colors={colors}
                  />
                ))}
              </ScrollView>
            </>
          )}

          {/* All Courses section */}
          <Text style={[ss.sectionLbl, { color: colors.textMeta, ...ff(600) }]}>
            All Courses
          </Text>
          <View style={ss.courseList}>
            {COURSES.map((course) => (
              <CourseListRow
                key={course.id}
                course={course}
                onPress={() => handleCourse(course.title)}
                ss={ss}
                colors={colors}
              />
            ))}
          </View>
        </ScrollView>
      )}

      {/* QUIZZES TAB */}
      {activeTab === 'quizzes' && (
        <ScrollView
          style={ss.scroll}
          contentContainerStyle={ss.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Daily quiz card */}
          <TouchableOpacity
            style={[
              ss.dailyQuiz,
              { backgroundColor: colors.cardBg, borderColor: colors.border },
            ]}
            onPress={() => handleQuiz(QUIZZES[0]!)}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Start today's daily quiz"
          >
            <Text style={ss.dailyEmoji}>🧠</Text>
            <Text style={[ss.dailyTitle, { color: colors.textPrimary, ...ff(700) }]}>
              Daily Money Quiz
            </Text>
            <Text style={[ss.dailySub, { color: colors.textMeta }]}>
              5 questions · +100 XP · Resets daily
            </Text>
            <TouchableOpacity
              style={[ss.startBtn, { backgroundColor: colors.brand }]}
              onPress={() => handleQuiz(QUIZZES[0]!)}
              accessibilityRole="button"
              accessibilityLabel="Start today's quiz"
            >
              <Text style={[ss.startBtnTxt, { color: colors.white, ...ff(700) }]}>
                Start Today&apos;s Quiz
              </Text>
            </TouchableOpacity>
          </TouchableOpacity>

          {/* Past quizzes */}
          <View style={ss.quizList}>
            {QUIZZES.filter((q) => !q.isDaily).map((quiz) => (
              <QuizCard
                key={quiz.id}
                quiz={quiz}
                onPress={() => handleQuiz(quiz)}
                ss={ss}
                colors={colors}
              />
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(colors: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    // Layout
    root: { flex: 1 },
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: layout.tabBarHeight + spacing.xl },

    // ── Header ───────────────────────────────────────────────────────────────
    header: {
      borderBottomLeftRadius: radius.xl,
      borderBottomRightRadius: radius.xl,
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.lg,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.smd,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 11,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    titleTxt: { fontSize: 17 },
    titleSpacer: { width: 36 },
    heroHeading: { fontSize: 21, letterSpacing: -0.3 },
    heroSub: { fontSize: 13, marginTop: 3 },

    // ── Hub tab pills ─────────────────────────────────────────────────────────
    hubTabs: {
      flexDirection: 'row',
      borderRadius: radius.sm,
      padding: 3,
      marginTop: spacing.mdn,
    },
    hubTab: {
      flex: 1,
      height: 34,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    hubTabTxt: { fontSize: 13 },

    // ── Category chips ────────────────────────────────────────────────────────
    chips: {
      flexDirection: 'row',
      gap: spacing.sm - 1,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    chip: {
      paddingHorizontal: 13,
      paddingVertical: 7,
      borderRadius: radius.full,
      borderWidth: 1.5,
    },
    chipTxt: { fontSize: 12 },

    // ── Featured card ─────────────────────────────────────────────────────────
    featCard: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      borderRadius: radius.lg,
      padding: spacing.xl,
      overflow: 'hidden',
    },
    featGlow: {
      position: 'absolute',
      top: -20,
      right: -20,
      width: 90,
      height: 90,
      borderRadius: 45,
      backgroundColor: 'rgba(168,224,99,0.20)',
    },
    featTagRow: { marginBottom: 9 },
    featTagPill: {
      alignSelf: 'flex-start',
      backgroundColor: 'rgba(168,224,99,0.15)',
      borderRadius: 7,
      paddingHorizontal: 9,
      paddingVertical: 3,
    },
    featTagTxt: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5 },
    featTitle: { fontSize: 18, lineHeight: 24, letterSpacing: -0.3 },
    featMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.smd,
      marginTop: spacing.smd,
    },
    featXpBadge: {
      backgroundColor: 'rgba(255,255,255,0.15)',
      borderRadius: 7,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    featXpTxt: { fontSize: 11 },
    featMetaTxt: { fontSize: 12 },
    textInverseFaint: { opacity: 0.55 },

    // ── Article list ──────────────────────────────────────────────────────────
    artList: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
    artCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      padding: 13,
      ...shadow.sm,
    },
    artThumb: {
      width: 66,
      height: 66,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    artEmoji: { fontSize: 30 },
    artContent: { flex: 1, minWidth: 0 },
    artTag: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 },
    artTitle: { fontSize: 13, lineHeight: 18, marginTop: 3 },
    artMeta: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 5 },
    artMetaTxt: { fontSize: 11 },
    artXpBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
    artXpTxt: { fontSize: 11 },
    emptyWrap: { alignItems: 'center', paddingVertical: spacing.xxl },
    emptyTxt: { fontSize: 14 },

    // ── Courses — section label ───────────────────────────────────────────────
    sectionLbl: { fontSize: 13, marginLeft: spacing.lg, marginTop: spacing.mdn, marginBottom: 10 },
    courseMiniRow: {
      flexDirection: 'row',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
    },

    // ── Course mini card (horizontal scroll) ──────────────────────────────────
    courseMini: {
      width: 200,
      borderRadius: radius.md,
      borderWidth: 1,
      overflow: 'hidden',
      flexShrink: 0,
      ...shadow.sm,
    },
    courseThumb: {
      height: 88,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    courseThumbEmoji: { fontSize: 36 },
    coursePlay: {
      position: 'absolute',
      bottom: 8,
      right: 8,
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: 'rgba(255,255,255,0.9)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    courseMiniInfo: { padding: 10 },
    courseTag: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 },
    courseTitle: { fontSize: 13, lineHeight: 18, marginTop: 3 },
    courseMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },
    courseLessons: { fontSize: 10 },
    courseXpBadge: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
    courseXpTxt: { fontSize: 10 },
    courseProg: { height: 3, borderRadius: 2, marginTop: 7, overflow: 'hidden' },
    courseProgFill: { height: '100%', borderRadius: 2 },

    // ── Course list row (chal-c style) ────────────────────────────────────────
    courseList: { paddingHorizontal: spacing.lg, gap: spacing.sm + 1, paddingTop: 0 },
    courseRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      padding: 14,
      ...shadow.sm,
    },
    courseRowIc: {
      width: 46,
      height: 46,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      overflow: 'hidden',
    },
    courseRowEmoji: { fontSize: 22 },
    courseRowInfo: { flex: 1, minWidth: 0 },
    chTtl: { fontSize: 13 },
    chDesc: { fontSize: 12, marginTop: 2, lineHeight: 17 },
    chFoot: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
    },
    chXpBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    chXpTxt: { fontSize: 11 },
    chProgTxt: { fontSize: 11 },
    chBar: { height: 4, borderRadius: 2, marginTop: 7, overflow: 'hidden' },
    chFill: { height: '100%', borderRadius: 2 },

    // ── Daily quiz card ───────────────────────────────────────────────────────
    dailyQuiz: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.mdn,
      borderRadius: radius.lg,
      borderWidth: 1,
      padding: spacing.xl,
      alignItems: 'center',
      ...shadow.sm,
    },
    dailyEmoji: { fontSize: 40, marginBottom: 12 },
    dailyTitle: { fontSize: 16 },
    dailySub: { fontSize: 13, marginTop: 6, lineHeight: 20 },
    startBtn: {
      marginTop: spacing.lg,
      height: 46,
      width: '100%',
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    startBtnTxt: { fontSize: 14 },

    // ── Quiz list ─────────────────────────────────────────────────────────────
    quizList: {
      paddingHorizontal: spacing.lg,
      gap: spacing.sm + 1,
      marginTop: spacing.mdn,
    },
  });
}
