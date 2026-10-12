import 'generated/models.dart';

/// Display names and blurbs for the four launch profile types.
extension ProfileTypeLabels on ProfileType {
  String get label => switch (this) {
    ProfileType.DEVELOPER => 'Developer',
    ProfileType.DESIGNER => 'Designer',
    ProfileType.STUDENT => 'Student / New grad',
    ProfileType.PROFESSIONAL => 'General professional',
  };

  String get blurb => switch (this) {
    ProfileType.DEVELOPER => 'Projects, GitHub, tech stack',
    ProfileType.DESIGNER => 'Visual work and case studies',
    ProfileType.STUDENT => 'Education, projects, internships',
    ProfileType.PROFESSIONAL => 'Experience and achievements',
  };
}

extension ProjectStatusLabels on ProjectStatus {
  String get label => switch (this) {
    ProjectStatus.DRAFT => 'Draft',
    ProjectStatus.GENERATING => 'Generating',
    ProjectStatus.CHOOSING => 'Choosing design',
    ProjectStatus.EDITING => 'Editing',
    ProjectStatus.EXPORTED => 'Exported',
  };
}
