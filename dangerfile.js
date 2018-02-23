import { danger, fail, markdown, message, schedule, warn } from 'danger';

const removeAtSymbols = string => {
  return string.replace(/@/g, '');
};

// Fails if commit messages aren't complying with conventions
const commitLint = commit => {
  // Convention: <header><blank line><body><blank line><footer>
  // where <header> = <type>(<scope>): <subject> or <type>: <subject>

  const headerRegex = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.{1,}\))?: (.{1,})/;

  const { msg, sha } = commit;
  const commitIdentificator = `Commit ${sha}`;
  const errorMessage =
    `${commitIdentificator} message does not comply with` +
    ` the conventional-changelog-standard conventions.`;

  if (!msg) {
    return `${commitIdentificator} has no commit message`;
  }

  // checks for <header>
  if (!headerRegex.test(msg)) {
    return (
      `${errorMessage} Line #1 should be \`<type>(<scope>): <subject>\` or ` +
      `\`<type>: <subject>\`.`
    );
  }

  const msgLines = msg.split('\n');
  const hasTextRegex = /([^\W\_]){1,}/;

  // checks for <blank line> between <header> and <body>
  if (msgLines.length > 1 && msgLines[1] !== '') {
    return `${errorMessage} Line #2 should be \`<blank line>\`.`;
  }

  // checks for <body>
  if (msgLines.length > 2 && !hasTextRegex.test(msgLines[2])) {
    return `${errorMessage} Line #3 should be \`<body>\` (with text).`;
  }

  // checks for <blank line> between <body> and <footer>
  if (msgLines.length > 3 && msgLines[3] !== '') {
    return `${errorMessage} Line #4 should be \`<blank line>\`.`;
  }

  // checks for <footer>
  if (msgLines.length > 4 && !hasTextRegex.test(msgLines[4])) {
    return `${errorMessage} Line #3 should be \`<footer>\` with text.`;
  }

  return undefined;
};

// Converts danger.github.commits to simple objects
const commits = danger.github.commits.map(obj => ({
  sha: obj.sha,
  msg: obj.commit.message,
}));

const commitErrors = commits.map(commitLint);
// If any of the commit messages of this PR isn't in complicance with the rules
if (commitErrors.some(e => e !== undefined)) {
  // Fail the build
  commitErrors.forEach(error => {
    if (error !== undefined) {
      fail(error);
    }
  });
}

// Checks if yarn.lock is changed when package.json was modified and vice-versa
const packageChanged = danger.git.modified_files.includes('package.json');
const lockfileChanged = danger.git.modified_files.includes('yarn.lock');

if (packageChanged && !lockfileChanged) {
  const message = 'Changes were made to package.json, but not to yarn.lock';
  const idea = 'Perhaps you need to run `yarn install`?';
  warn(`${message} - <i>${idea}</i>`);
}

// Warn when there is a big PR
const bigPRThreshold = 600;
if (danger.github.pr.additions + danger.github.pr.deletions > bigPRThreshold) {
  warn(':exclamation: Big PR');
  markdown(
    '> Pull Request size seems relatively large. If Pull Request contains multiple changes, split each into separate PR will helps faster, easier review.',
  );
}

// Always ensure we assign someone, so that our Slackbot can do its work correctly
if (danger.github.pr.assignee === null) {
  warn(
    'Please assign someone to merge this PR, and optionally include people who should review.',
  );
}

// Checks for new dependencies
schedule(async () => {
  const packageDiff = await danger.git.JSONDiffForFile('package.json');
  if (packageDiff && packageDiff.dependencies) {
    let dependenciesString;
    const newDependencies = packageDiff.dependencies.added;
    const newCount = newDependencies.length;

    if (newCount > 0) {
      newDependencies.forEach(newDependency => {
        if (!dependenciesString) {
          dependenciesString = newDependency;
        } else {
          dependenciesString = `${dependenciesString}, ${newDependency}`;
        }
      });
      message(
        `There ${newCount === 1 ? 'is' : 'are'} ${newCount} new ${
          newCount === 1 ? 'dependency' : 'dependencies'
        } added in this PR: ${removeAtSymbols(dependenciesString)}.`,
      );
    }
  }
});

// Checks for removed dependencies
schedule(async () => {
  const packageDiff = await danger.git.JSONDiffForFile('package.json');
  if (packageDiff && packageDiff.dependencies) {
    let dependenciesString;
    const removedDependencies = packageDiff.dependencies.removed;

    if (removedDependencies.length > 0) {
      removedDependencies.forEach(newDependency => {
        if (!dependenciesString) {
          dependenciesString = newDependency;
        } else {
          dependenciesString = `${dependenciesString}, ${newDependency}`;
        }
      });
      message(
        `There is ${removedDependencies.length} removed ${
          removedDependencies.length === 1 ? 'dependency' : 'dependencies'
        } in this PR: ${removeAtSymbols(dependenciesString)}.`,
      );
    }
  }
});

// Checks for updated dependencies
schedule(async () => {
  const packageDiff = await danger.git.JSONDiffForFile('package.json');
  if (packageDiff && packageDiff.dependencies) {
    let updatedDependencies = [];
    const dependencies = packageDiff.dependencies;

    // For each dependency in the new package.json
    Object.keys(dependencies.after).forEach(dependency => {
      // If the dependency version has been updated
      const versionBefore = dependencies.before[dependency];
      const versionAfter = dependencies.after[dependency];
      if (versionBefore && versionAfter !== versionBefore) {
        updatedDependencies.push(
          `${dependency} (from <b>${versionBefore}</b> to <b>${versionAfter}</b>)`,
        );
      }
    });

    let updatedString;
    if (updatedDependencies.length > 0) {
      updatedDependencies.forEach(updatedDependency => {
        if (!updatedString) {
          updatedString = updatedDependency;
        } else {
          updatedString = `${updatedString}, ${updatedDependency}`;
        }
      });
      message(
        `The version of ${updatedDependencies.length} ${
          updatedDependencies.length === 1 ? 'dependency' : 'dependencies'
        } have been updated in this PR: ${removeAtSymbols(updatedString)}.`,
      );
    }
  }
});

// Checks for new devDependencies
schedule(async () => {
  const packageDiff = await danger.git.JSONDiffForFile('package.json');
  if (packageDiff && packageDiff.devDependencies) {
    let devDependenciesString;
    const newDevDependencies = packageDiff.devDependencies.added;
    const newCount = newDevDependencies.length;

    if (newCount > 0) {
      newDevDependencies.forEach(newDevDependency => {
        if (!devDependenciesString) {
          devDependenciesString = newDevDependency;
        } else {
          devDependenciesString = `${devDependenciesString}, ${newDevDependency}`;
        }
      });
      message(
        `There ${newCount === 1 ? 'is' : 'are'} ${newCount} new dev${
          newCount === 1 ? 'Dependency' : 'Dependencies'
        } added in this PR: ${removeAtSymbols(devDependenciesString)}.`,
      );
    }
  }
});

// Checks for removed devDependencies
schedule(async () => {
  const packageDiff = await danger.git.JSONDiffForFile('package.json');
  if (packageDiff && packageDiff.devDependencies) {
    let devDependenciesString;
    const removedDevDependencies = packageDiff.devDependencies.removed;
    const removedCount = removedDevDependencies.length;

    if (removedCount > 0) {
      removedDevDependencies.forEach(removedDevDependency => {
        if (!devDependenciesString) {
          devDependenciesString = removedDevDependency;
        } else {
          devDependenciesString = `${devDependenciesString}, ${removedDevDependency}`;
        }
      });
      message(
        `There ${
          removedCount === 1 ? 'is' : 'are'
        } ${removedCount} removed dev${
          removedCount === 1 ? 'Dependency' : 'Dependencies'
        } in this PR: ${removeAtSymbols(devDependenciesString)}.`,
      );
    }
  }
});

// Checks for updated devDependencies
schedule(async () => {
  const packageDiff = await danger.git.JSONDiffForFile('package.json');
  if (packageDiff && packageDiff.devDependencies) {
    let updatedDependencies = [];
    const devDependencies = packageDiff.devDependencies;

    // For each devDependency in the new package.json
    Object.keys(devDependencies.after).forEach(devDependency => {
      // If the devDependency version has been updated
      const versionBefore = devDependencies.before[devDependency];
      const versionAfter = devDependencies.after[devDependency];
      if (versionBefore && versionAfter !== versionBefore) {
        updatedDependencies.push(
          `${devDependency} (from <b>${versionBefore}</b> to <b>${versionAfter}</b>)`,
        );
      }
    });

    let updatedString;
    if (updatedDependencies.length > 0) {
      updatedDependencies.forEach(updatedDependency => {
        if (!updatedString) {
          updatedString = updatedDependency;
        } else {
          updatedString = `${updatedString}, ${updatedDependency}`;
        }
      });
      message(
        `The version of ${updatedDependencies.length} dev${
          updatedDependencies.length === 1 ? 'Dependency' : 'Dependencies'
        } have been updated in this PR: ${removeAtSymbols(updatedString)}.`,
      );
    }
  }
});
