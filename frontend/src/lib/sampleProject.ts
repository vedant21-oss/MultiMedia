import { mediaApi, projectApi } from '@/services/endpoints';
import type { Project } from '@/types';

/**
 * A ready-made project so a new account has something to explore. The files
 * are built here and sent through the normal upload pipeline, so every number
 * on the dashboard comes from real processing, not seeded rows.
 */
const BRIEF = `# Launch brief: "Deep Work Mornings" course

## Audience
Early-career developers and students who lose their mornings to notifications.

## Core promise
Two focused hours before 11am, five days a week, without quitting social media.

## Key points
1. Phone stays in another room until the first focus block ends.
2. Plan tomorrow's single most important task the night before.
3. Work in 50-minute blocks with 10-minute walking breaks.
4. Track streaks, not hours. Missing one day is fine; missing two is a pattern.

## Proof
In our pilot, 42 students kept the routine for 21 days. 31 of them reported
finishing a side project they had abandoned.

## Launch plan
- Week 1: short clips from the intro video on Instagram Reels and YouTube Shorts.
- Week 2: LinkedIn carousel on the four key points.
- Week 3: open enrolment. Price: $29, early bird $19 for the first 100 sign-ups.
`;

const SUBTITLES = `1
00:00:00,000 --> 00:00:05,200
Welcome to Deep Work Mornings. I'm going to give you back two hours a day.

2
00:00:05,200 --> 00:00:11,800
The first rule is simple: your phone sleeps in another room until your first block ends.

3
00:00:11,800 --> 00:00:18,400
Every evening, write down one task. Just one. That's what tomorrow morning is for.

4
00:00:18,400 --> 00:00:25,000
Work for fifty minutes, then walk for ten. Walking is where the hard problems untangle.

5
00:00:25,000 --> 00:00:32,600
In our pilot, forty-two students tried this for twenty-one days, and most finished a project they'd abandoned.

6
00:00:32,600 --> 00:00:38,000
Don't count hours. Count streaks. Miss one day, fine. Miss two, and it's a pattern.
`;

async function slideImage(): Promise<File> {
  const c = document.createElement('canvas');
  c.width = 1280;
  c.height = 720;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#7c3aed';
  g.fillRect(0, 0, 24, c.height);
  g.fillStyle = '#111111';
  g.font = 'bold 64px Helvetica, Arial, sans-serif';
  g.fillText('The 50 / 10 Rule', 90, 170);
  g.font = '40px Helvetica, Arial, sans-serif';
  ['50 minutes of focused work', '10 minutes walking, no phone', '4 blocks = a full deep work morning'].forEach(
    (line, i) => g.fillText(`• ${line}`, 90, 300 + i * 90),
  );
  g.font = '28px Helvetica, Arial, sans-serif';
  g.fillStyle = '#555555';
  g.fillText('Deep Work Mornings, slide 3', 90, 650);
  const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/png'));
  return new File([blob], 'slide-50-10-rule.png', { type: 'image/png' });
}

export async function createSampleProject(): Promise<Project> {
  const project = await projectApi.create({
    name: 'Sample: Deep Work Mornings',
    description: 'A course launch: intro video subtitles, a launch brief and a slide.',
    context: 'Online course launch aimed at early-career developers.',
  });
  const files = [
    new File([BRIEF], 'launch-brief.md', { type: 'text/markdown' }),
    new File([SUBTITLES], 'intro-video.srt', { type: 'application/x-subrip' }),
    await slideImage(),
  ];
  await mediaApi.upload(project.id, files);
  return project;
}
