# TMS Architecture Documentation

See [Private media storage](./private-media-storage.md) for R2 ownership, authorization, object keys, and the rollout covering payment proofs, student photos, Digital IDs, QR images, and certificates.

## Overview
This document describes the architecture of the TMS (Task Management System) based on the **flutter-architecture** skill principles: MVVM pattern, feature-first organization, and layered architecture.

## Architecture Principles

Based on the **flutter-architecture** skill:

1. **Canonical dependency rule**: Lower layers must not depend on upper layers
2. **Views are declarative and thin** - ViewModels handle UI state and commands
3. **Repositories are the single source of truth** for app data
4. **Services are stateless wrappers** around external data sources
4. **Feature-first organization** for medium/large apps with team development

## Project Structure (Feature-First)

```
lib/
├── core/                    # Shared core functionality
│   ├── constants/           # App-wide constants
│   ├── errors/              # Error handling (Result pattern)
│   ├── extensions/          # Dart extensions
│   ├── routing/             # Router configuration (go_router)
│   ├── services/            # Platform-independent services
│   ├── utils/               # Utility functions
│   └── widgets/             # Shared base widgets
├── features/                # Feature modules (feature-first)
│   ├── auth/                # Authentication feature
│   │   ├── data/            # Data layer
│   │   │   ├── repositories/
│   │   │   ├── services/
│   │   │   └── models/
│   │   ├── domain/          # Domain layer (optional)
│   │   │   ├── use_cases/
│   │   │   └── entities/
│   │   └── presentation/    # UI layer
│   │       ├── view_models/
│   │       ├── views/
│   │       └── widgets/
│   ├── tasks/               # Task management feature
│   │   ├── data/
│   │   ├── domain/
│   │   └── presentation/
│   ├── projects/            # Project management feature
│   │   ├── data/
│   │   ├── domain/
│   │   └── presentation/
│   └── settings/            # User settings feature
│       ├── data/
│       ├── domain/
│       └── presentation/
├── shared/                  # Shared across features
│   ├── models/              # Shared data models
│   ├── widgets/             # Shared UI components
│   ├── constants/           # Shared constants
│   └── utils/               # Shared utilities
└── main.dart                # App entry point
```

## Layer Responsibilities

### UI Layer (Presentation)
- **Views**: Declarative widgets, minimal logic
- **ViewModels**: UI state management, commands, navigation triggers
- **Widgets**: Reusable UI components

### Data Layer
- **Repositories**: Single source of truth, own data mutation
- **Services**: Stateless wrappers for external APIs, DB, platform channels
- **Models**: Data transfer objects, serialization

### Domain Layer (Optional)
- **Use Cases**: Complex business logic, multi-repository operations
- **Entities**: Core business objects

## Design Patterns (from flutter-architecture skill)

### 1. Command Pattern
Encapsulate actions for undo/redo, queuing, logging:
```dart
abstract class Command<T> {
  Future<Result<T>> execute();
  Future<void> undo();
}
```

### 2. Result Pattern (Type-Safe Error Handling)
```dart
sealed class Result<T> {
  const Result();
  T get value => throw UnimplementedError();
  Exception get error => throw UnimplementedError();
}

final class Success<T> extends Result<T> {
  final T value;
  const Success(this.value);
}

final class Failure<T> extends Result<T> {
  final Exception error;
  const Failure(this.error);
}
```

### 3. Repository Pattern
```dart
abstract class TaskRepository {
  Stream<List<Task>> watchTasks();
  Future<Result<Task>> createTask(Task task);
  Future<Result<void>> updateTask(Task task);
  Future<Result<void>> deleteTask(String id);
}
```

### 4. Offline-First / Optimistic UI
- Immediate UI updates
- Background sync with conflict resolution
- Local-first database (Drift/SQLite)

## State Management: Riverpod

### Provider Structure
```dart
// Feature-scoped providers
final taskRepositoryProvider = Provider<TaskRepository>((ref) {
  return TaskRepositoryImpl(ref.watch(databaseProvider));
});

final taskViewModelProvider = StateNotifierProvider<TaskViewModel, TaskState>((ref) {
  return TaskViewModel(ref.watch(taskRepositoryProvider));
});

// UI consumes via ConsumerWidget or ref.watch
```

## Navigation: go_router (from flutter-navigation skill)

### Route Configuration
```dart
final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/',
    routes: [
      GoRoute(path: '/', builder: (_, __) => const HomeView()),
      GoRoute(path: '/login', builder: (_, __) => const LoginView()),
      GoRoute(path: '/tasks', builder: (_, __) => const TasksView()),
      GoRoute(path: '/tasks/:id', builder: (_, state) => TaskDetailView(id: state.pathParameters['id']!)),
    ],
    redirect: (context, state) {
      // Auth guard logic
    },
  );
});
```

## Dependency Injection

Using Riverpod for DI:
- Repositories provided at feature level
- Services provided at core/app level
- ViewModels consume repositories via ref.watch()

## Cross-Feature Rules

1. **No direct feature-to-feature imports** - Use shared/ or DI
2. **Shared code in `shared/`** - Models, widgets, constants
3. **Stable interfaces through DI** - Abstract classes for repositories
4. **Merge features when boundary is artificial**

## Validation Checklist (from flutter-architecture skill)

- [ ] New imports respect feature/layer boundaries
- [ ] ViewModels don't perform platform/file/network I/O directly
- [ ] Repositories remain UI-independent
- [ ] Service interactions are testable
- [ ] `flutter analyze` passes
- [ ] Relevant `flutter test` suites pass
- [ ] Template validation with `dart format`

## References
- [flutter-architecture skill](https://github.com/MADTeacher/mad-agents-skills/tree/main/flutter-architecture)
- [Concepts](references/concepts.md)
- [Layers](references/layers.md)
- [Feature-First](references/feature-first.md)
- [MVVM](references/mvvm.md)
- [Design Patterns](references/design-patterns.md)
